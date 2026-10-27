import { ConflictException, NotFoundException } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { Test, type TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { UserRole } from '../../src/common/enums/role.enum';
import { DomainEventsModule } from '../../src/common/infrastructure/events/domain-events.module';
import type { Actor } from '../../src/common/types/actor';
import { MedicalCaseStatus } from '../../src/modules/medical/constants/medical-case.enum';
import { MedicalCasesService } from '../../src/modules/medical/medical-records/medical-cases.service';
import { MedicalRecordsModule } from '../../src/modules/medical/medical-records/medical-records.module';
import { fixtures } from './fixtures';
import {
  startTestPostgres,
  truncateAllTables,
  type TestPostgres,
} from './postgres';

const DAY_MS = 86_400_000;

describe('MedicalCasesService.correctConclusion (Postgres)', () => {
  let db: TestPostgres;
  let dataSource: DataSource;
  let moduleRef: TestingModule;
  let seed: ReturnType<typeof fixtures>;
  let service: MedicalCasesService;

  beforeAll(async () => {
    db = await startTestPostgres();
    dataSource = db.dataSource;
    seed = fixtures(dataSource);
    moduleRef = await Test.createTestingModule({
      imports: [
        EventEmitterModule.forRoot(),
        TypeOrmModule.forRootAsync({
          useFactory: () => ({ type: 'postgres' }),
          dataSourceFactory: () => Promise.resolve(dataSource),
        }),
        DomainEventsModule,
        MedicalRecordsModule,
      ],
    }).compile();
    service = moduleRef.get(MedicalCasesService);
  });

  afterAll(async () => {
    await moduleRef?.close();
    await db?.container.stop();
  });

  beforeEach(() => truncateAllTables(dataSource));

  const setup = async (status = MedicalCaseStatus.CLOSED) => {
    const vetId = await seed.user(UserRole.VETERINARIAN);
    const [user] = await dataSource.query<{ keycloak_id: string }[]>(
      'SELECT keycloak_id FROM users WHERE id = $1',
      [vetId],
    );
    const actor: Actor = {
      sub: user.keycloak_id,
      roles: [UserRole.VETERINARIAN],
    };
    const horse = await seed.horse('Winx');
    const caseId = await seed.medicalCase(horse, vetId, {
      status,
      openedAt: new Date(Date.now() - 10 * DAY_MS).toISOString(),
      ...(status === MedicalCaseStatus.OPEN
        ? {}
        : { closedAt: new Date(Date.now() - DAY_MS).toISOString() }),
    });
    await dataSource.query(
      `UPDATE medical_cases SET final_conclusion = 'Khỏi hẳn' WHERE id = $1`,
      [caseId],
    );
    return { actor, vetId, horse, caseId };
  };

  const caseRow = (id: string) =>
    dataSource
      .query<Record<string, unknown>[]>(
        'SELECT status, final_conclusion, closed_at, closed_by FROM medical_cases WHERE id = $1',
        [id],
      )
      .then((rows) => rows[0]);

  const auditsOf = (caseId: string) =>
    dataSource.query<Record<string, unknown>[]>(
      `SELECT actor_id, before_data, after_data, reason, feature FROM audit_logs
        WHERE entity_type = 'MEDICAL_CASE' AND entity_id = $1`,
      [caseId],
    );

  it('corrects the final conclusion of a closed case, audits it with the reason and notifies nobody', async () => {
    const { actor, vetId, caseId } = await setup();
    const before = await caseRow(caseId);

    const result = await service.correctConclusion(actor, caseId, {
      finalConclusion: 'Đỡ, còn theo dõi gân trước trái',
      reason: 'Ghi nhầm kết luận',
    });

    expect(result).toMatchObject({
      id: caseId,
      status: MedicalCaseStatus.CLOSED,
      finalConclusion: 'Đỡ, còn theo dõi gân trước trái',
    });
    expect(await caseRow(caseId)).toEqual({
      ...before,
      final_conclusion: 'Đỡ, còn theo dõi gân trước trái',
    });
    expect(await auditsOf(caseId)).toEqual([
      {
        actor_id: vetId,
        before_data: { finalConclusion: 'Khỏi hẳn' },
        after_data: { finalConclusion: 'Đỡ, còn theo dõi gân trước trái' },
        reason: 'Ghi nhầm kết luận',
        feature: 'MED_CASE_CLOSE',
      },
    ]);
    expect(
      await dataSource.query('SELECT event_name FROM outbox_events'),
    ).toEqual([]);
  });

  it('writes nothing when the conclusion is the same', async () => {
    const { actor, caseId } = await setup();

    await expect(
      service.correctConclusion(actor, caseId, {
        finalConclusion: 'Khỏi hẳn',
        reason: 'Bấm nhầm',
      }),
    ).resolves.toMatchObject({ finalConclusion: 'Khỏi hẳn' });

    expect(await auditsOf(caseId)).toEqual([]);
  });

  it('refuses an open or cancelled case with 409', async () => {
    for (const status of [
      MedicalCaseStatus.OPEN,
      MedicalCaseStatus.CANCELLED,
    ]) {
      await truncateAllTables(dataSource);
      const { actor, caseId } = await setup(status);

      await expect(
        service.correctConclusion(actor, caseId, {
          finalConclusion: 'Khỏi',
          reason: 'Sửa',
        }),
      ).rejects.toThrow(
        new ConflictException(
          'Chỉ đính chính được kết luận cuối của bệnh án đã đóng',
        ),
      );
    }
  });

  it('refuses a case of a deceased horse with 409', async () => {
    const { actor, horse, caseId } = await setup();
    await dataSource.query(
      `UPDATE horses SET lifecycle_status = 'DECEASED' WHERE id = $1`,
      [horse],
    );

    await expect(
      service.correctConclusion(actor, caseId, {
        finalConclusion: 'Khỏi',
        reason: 'Sửa',
      }),
    ).rejects.toThrow(ConflictException);
    expect(await caseRow(caseId)).toMatchObject({
      final_conclusion: 'Khỏi hẳn',
    });
  });

  it('does not find an unknown case', async () => {
    const { actor } = await setup();

    await expect(
      service.correctConclusion(actor, randomUUID(), {
        finalConclusion: 'Khỏi',
        reason: 'Sửa',
      }),
    ).rejects.toThrow(NotFoundException);
  });
});

import { BadRequestException } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { Test, type TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { UserRole } from '../../src/common/enums/role.enum';
import { DomainEventsModule } from '../../src/common/infrastructure/events/domain-events.module';
import type { Actor } from '../../src/common/types/actor';
import { clubToday } from '../../src/common/utils/club-date';
import { HORSE_DECEASED_EVENT } from '../../src/modules/horses/constants/horse.constants';
import { HorseLifecycleStatus } from '../../src/modules/horses/enums/horse-status.enum';
import { CaseLockDecision } from '../../src/modules/medical/constants/medical-case.enum';
import { MEDICAL_CASE_CLOSED_EVENT } from '../../src/modules/medical/constants/medical-events.constants';
import { MedicalCasesService } from '../../src/modules/medical/medical-records/medical-cases.service';
import { MedicalRecordsModule } from '../../src/modules/medical/medical-records/medical-records.module';
import { fixtures } from './fixtures';
import {
  startTestPostgres,
  truncateAllTables,
  type TestPostgres,
} from './postgres';

describe('MedicalCasesService.closeCase with date of death (Postgres)', () => {
  let db: TestPostgres;
  let dataSource: DataSource;
  let moduleRef: TestingModule;
  let seed: ReturnType<typeof fixtures>;
  let service: MedicalCasesService;

  const actorOf = async (userId: string, role: UserRole): Promise<Actor> => {
    const [row] = await dataSource.query<{ keycloak_id: string }[]>(
      'SELECT keycloak_id FROM users WHERE id = $1',
      [userId],
    );
    return { sub: row.keycloak_id, roles: [role] };
  };

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

  const setup = async () => {
    const vet = await seed.user(UserRole.VETERINARIAN);
    const owner = await seed.user(UserRole.HORSE_OWNER);
    const barn = await seed.barn('Khu A');
    const horse = await seed.horse('Winx', { ownerId: owner, barnId: barn });
    const caseId = await seed.medicalCase(horse, vet);
    const [lock] = await dataSource.query<{ id: string }[]>(
      `INSERT INTO training_locks (version, horse_id, locked_by, reason, lock_start, status, case_id)
       VALUES (1, $1, $2, 'Chấn thương', now(), 'ACTIVE', $3) RETURNING id`,
      [horse, vet, caseId],
    );
    const request = await seed.examRequest(horse);
    return {
      horse,
      caseId,
      lockId: lock.id,
      request,
      actor: await actorOf(vet, UserRole.VETERINARIAN),
    };
  };

  const state = async (horse: string, caseId: string) => {
    const [horseRow] = await dataSource.query<Record<string, unknown>[]>(
      `SELECT lifecycle_status, lifecycle_reason, barn_id,
              to_char(date_of_death, 'YYYY-MM-DD') AS date_of_death
       FROM horses WHERE id = $1`,
      [horse],
    );
    const [caseRow] = await dataSource.query<Record<string, unknown>[]>(
      'SELECT status, total_cost FROM medical_cases WHERE id = $1',
      [caseId],
    );
    const events = await dataSource.query<{ event_name: string }[]>(
      'SELECT event_name FROM outbox_events ORDER BY created_at',
    );
    return {
      horse: horseRow,
      medicalCase: caseRow,
      events: events.map((row) => row.event_name),
    };
  };

  it('closes the case and records the death in one transaction', async () => {
    const { horse, caseId, lockId, request, actor } = await setup();

    const result = await service.closeCase(actor, caseId, {
      finalConclusion: 'Ngựa mất do suy tim',
      totalCost: 5_000_000,
      dateOfDeath: clubToday(),
    });

    expect(result).toMatchObject({ status: 'CLOSED', totalCost: 5_000_000 });
    const after = await state(horse, caseId);
    expect(after.horse).toEqual({
      lifecycle_status: HorseLifecycleStatus.DECEASED,
      lifecycle_reason: 'Ngựa mất do suy tim',
      barn_id: null,
      date_of_death: clubToday(),
    });
    expect(after.medicalCase).toEqual({
      status: 'CLOSED',
      total_cost: '5000000',
    });
    expect(after.events).toEqual(
      expect.arrayContaining([MEDICAL_CASE_CLOSED_EVENT, HORSE_DECEASED_EVENT]),
    );
    const [lock] = await dataSource.query<Record<string, unknown>[]>(
      'SELECT status, release_conclusion FROM training_locks WHERE id = $1',
      [lockId],
    );
    expect(lock).toEqual({
      status: 'RELEASED',
      release_conclusion: 'Gỡ do ngựa mất',
    });
    const [exam] = await dataSource.query<{ status: string }[]>(
      'SELECT status FROM medical_exam_requests WHERE id = $1',
      [request],
    );
    expect(exam.status).toBe('DISMISSED');
  });

  it('rejects a lock choice with a date of death and changes nothing', async () => {
    const { horse, caseId, actor } = await setup();
    const before = await state(horse, caseId);

    await expect(
      service.closeCase(actor, caseId, {
        finalConclusion: 'Ngựa mất',
        totalCost: 0,
        dateOfDeath: clubToday(),
        lockDecision: CaseLockDecision.RELEASE,
      }),
    ).rejects.toThrow(
      new BadRequestException(
        'Ngựa mất thì lệnh khóa huấn luyện tự gỡ, không chọn gỡ hay giữ khóa',
      ),
    );
    expect(await state(horse, caseId)).toEqual(before);
  });

  it('rolls back the case close when the date of death is invalid', async () => {
    const { horse, caseId, actor } = await setup();
    const before = await state(horse, caseId);

    await expect(
      service.closeCase(actor, caseId, {
        finalConclusion: 'Ngựa mất',
        totalCost: 0,
        dateOfDeath: '2999-01-01',
      }),
    ).rejects.toThrow('Ngày mất không được ở tương lai');
    expect(await state(horse, caseId)).toEqual(before);
    expect(before.medicalCase).toMatchObject({ status: 'OPEN' });
  });

  it('keeps the horse in the club when closing without a date of death', async () => {
    const { horse, caseId, actor } = await setup();

    await service.closeCase(actor, caseId, {
      finalConclusion: 'Khỏi bệnh',
      totalCost: 1_000_000,
      lockDecision: CaseLockDecision.RELEASE,
    });

    const after = await state(horse, caseId);
    expect(after.horse).toMatchObject({
      lifecycle_status: HorseLifecycleStatus.ACTIVE,
      date_of_death: null,
    });
    expect(after.events).not.toContain(HORSE_DECEASED_EVENT);
  });
});

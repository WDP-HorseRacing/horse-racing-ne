import { ForbiddenException } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { Test, type TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { UserRole } from '../../src/common/enums/role.enum';
import { DomainEventsModule } from '../../src/common/infrastructure/events/domain-events.module';
import type { Actor } from '../../src/common/types/actor';
import { HorseMeasurementType } from '../../src/modules/horses/enums/horse-measurement-type.enum';
import { MedicalCaseStatus } from '../../src/modules/medical/constants/medical-case.enum';
import {
  MedicalVisitConclusion,
  MedicalVisitKind,
} from '../../src/modules/medical/constants/medical-visit.enum';
import { MedicalRecordsModule } from '../../src/modules/medical/medical-records/medical-records.module';
import { MedicalVisitsService } from '../../src/modules/medical/medical-records/medical-visits.service';
import { fixtures } from './fixtures';
import {
  startTestPostgres,
  truncateAllTables,
  type TestPostgres,
} from './postgres';

describe('MedicalVisitsService.voidVisit (Postgres)', () => {
  let db: TestPostgres;
  let dataSource: DataSource;
  let moduleRef: TestingModule;
  let seed: ReturnType<typeof fixtures>;
  let service: MedicalVisitsService;

  const vet = async (): Promise<Actor> => {
    const id = await seed.user(UserRole.VETERINARIAN);
    const [row] = await dataSource.query<{ keycloak_id: string }[]>(
      'SELECT keycloak_id FROM users WHERE id = $1',
      [id],
    );
    return { sub: row.keycloak_id, roles: [UserRole.VETERINARIAN] };
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
    service = moduleRef.get(MedicalVisitsService);
  });

  afterAll(async () => {
    await moduleRef?.close();
    await db?.container.stop();
  });

  beforeEach(() => truncateAllTables(dataSource));

  const record = (author: Actor, horse: string, issue = false) =>
    service.createStandaloneVisit(author, horse, {
      kind: MedicalVisitKind.ROUTINE,
      conclusion: issue
        ? MedicalVisitConclusion.ISSUE
        : MedicalVisitConclusion.NORMAL,
      ...(issue ? { initialDiagnosis: 'Viêm gân' } : {}),
      measurements: [{ type: HorseMeasurementType.WEIGHT, value: 450 }],
    });

  const state = async (recordId: string) => {
    const [visit] = await dataSource.query<{ voided_at: Date | null }[]>(
      'SELECT voided_at FROM medical_records WHERE id = $1',
      [recordId],
    );
    const [metrics] = await dataSource.query<{ live: number }[]>(
      `SELECT COUNT(*)::int AS live FROM horse_measurements
        WHERE medical_record_id = $1 AND deleted_at IS NULL`,
      [recordId],
    );
    const [audits] = await dataSource.query<{ count: number }[]>(
      `SELECT COUNT(*)::int AS count FROM audit_logs
        WHERE entity_type = 'MEDICAL_RECORD' AND entity_id = $1
          AND reason IS NOT NULL`,
      [recordId],
    );
    return {
      voided: visit.voided_at !== null,
      liveMetrics: metrics.live,
      voidAudits: audits.count,
    };
  };

  const caseStatus = async (horse: string) => {
    const [row] = await dataSource.query<{ status: string }[]>(
      'SELECT status FROM medical_cases WHERE horse_id = $1',
      [horse],
    );
    return row.status;
  };

  it('lets the author void their visit', async () => {
    const author = await vet();
    const horse = await seed.horse('Winx');
    const visit = await record(author, horse);

    await service.voidVisit(author, visit.id, { reason: 'Nhầm ngựa' });

    expect(await state(visit.id)).toEqual({
      voided: true,
      liveMetrics: 0,
      voidAudits: 1,
    });
  });

  it('forbids another vet and changes nothing', async () => {
    const author = await vet();
    const other = await vet();
    const horse = await seed.horse('Winx');
    const visit = await record(author, horse, true);
    const before = await state(visit.id);

    await expect(
      service.voidVisit(other, visit.id, { reason: 'Nhầm ngựa' }),
    ).rejects.toThrow(
      new ForbiddenException(
        'Chỉ bác sĩ ghi phiếu khám mới được hủy phiếu này',
      ),
    );

    expect(before).toEqual({ voided: false, liveMetrics: 1, voidAudits: 0 });
    expect(await state(visit.id)).toEqual(before);
    expect(await caseStatus(horse)).toBe(MedicalCaseStatus.OPEN);
  });

  it('lets the author void the visit that opened the case, cancelling the case', async () => {
    const author = await vet();
    const horse = await seed.horse('Winx');
    const visit = await record(author, horse, true);

    await service.voidVisit(author, visit.id, { reason: 'Mở nhầm ngựa' });

    expect((await state(visit.id)).voided).toBe(true);
    expect(await caseStatus(horse)).toBe(MedicalCaseStatus.CANCELLED);
  });
});

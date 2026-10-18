import { ConflictException, NotFoundException } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { Test, type TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { UserRole } from '../../src/common/enums/role.enum';
import { DomainEventsModule } from '../../src/common/infrastructure/events/domain-events.module';
import type { Actor } from '../../src/common/types/actor';
import { HorseLifecycleStatus } from '../../src/modules/horses/enums/horse-status.enum';
import { MedicalCaseStatus } from '../../src/modules/medical/constants/medical-case.enum';
import { MEDICAL_VISIT_COST_ADJUSTED_EVENT } from '../../src/modules/medical/constants/medical-events.constants';
import { MedicalRecordsModule } from '../../src/modules/medical/medical-records/medical-records.module';
import { MedicalVisitsService } from '../../src/modules/medical/medical-records/medical-visits.service';
import { fixtures } from './fixtures';
import {
  startTestPostgres,
  truncateAllTables,
  type TestPostgres,
} from './postgres';

describe('MedicalVisitsService.adjustVisitCost (Postgres)', () => {
  let db: TestPostgres;
  let dataSource: DataSource;
  let moduleRef: TestingModule;
  let seed: ReturnType<typeof fixtures>;
  let service: MedicalVisitsService;

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
    service = moduleRef.get(MedicalVisitsService);
  });

  afterAll(async () => {
    await moduleRef?.close();
    await db?.container.stop();
  });

  beforeEach(() => truncateAllTables(dataSource));

  const setup = async (
    lifecycle: HorseLifecycleStatus = HorseLifecycleStatus.ACTIVE,
  ) => {
    const vetId = await seed.user(UserRole.VETERINARIAN);
    const a = await seed.user(UserRole.HORSE_OWNER);
    const b = await seed.user(UserRole.HORSE_OWNER);
    const horse = await seed.horse('Winx', { ownerId: b, lifecycle });
    await seed.ownership(
      horse,
      a,
      '2026-01-01T00:00:00Z',
      '2026-06-01T00:00:00Z',
    );
    await seed.ownership(horse, b, '2026-06-01T00:00:00Z');
    const caseId = await seed.medicalCase(horse, vetId, {
      status: MedicalCaseStatus.CLOSED,
      openedAt: '2026-05-01T00:00:00Z',
      closedAt: '2026-06-10T00:00:00Z',
    });
    const recordId = await seed.visit(horse, vetId, '2026-05-20T03:00:00Z', {
      caseId,
      cost: 15_000_000,
    });
    return {
      a,
      caseId,
      recordId,
      vet: await actorOf(vetId, UserRole.VETERINARIAN),
    };
  };

  const costOf = async (recordId: string) => {
    const [row] = await dataSource.query<{ cost: string }[]>(
      'SELECT cost FROM medical_records WHERE id = $1',
      [recordId],
    );
    return row.cost;
  };
  const audits = () =>
    dataSource.query<Record<string, unknown>[]>(
      `SELECT entity_type, entity_id, before_data, after_data, reason, feature FROM audit_logs WHERE entity_type = 'MEDICAL_RECORD'`,
    );
  const outbox = () =>
    dataSource.query<{ payload: Record<string, unknown> }[]>(
      'SELECT payload FROM outbox_events WHERE event_name = $1',
      [MEDICAL_VISIT_COST_ADJUSTED_EVENT],
    );

  it('adjusts the cost of a visit in a closed case, logs it and queues a notice for the owner of the exam date period', async () => {
    const { a, caseId, recordId, vet } = await setup();

    const result = await service.adjustVisitCost(vet, recordId, {
      cost: 1_500_000,
      reason: 'Gõ thừa số 0',
    });

    expect(result).toMatchObject({ id: recordId, cost: 1_500_000 });
    expect(await costOf(recordId)).toBe('1500000');
    expect(await audits()).toEqual([
      {
        entity_type: 'MEDICAL_RECORD',
        entity_id: recordId,
        before_data: { cost: 15_000_000 },
        after_data: { cost: 1_500_000 },
        reason: 'Gõ thừa số 0',
        feature: 'MED_VISIT',
      },
    ]);
    expect((await outbox()).map((row) => row.payload)).toEqual([
      expect.objectContaining({
        recordId,
        caseId,
        examDate: '2026-05-20T03:00:00.000Z',
        fromCost: 15_000_000,
        toCost: 1_500_000,
        costOwnerId: a,
      }),
    ]);
  });

  it('writes nothing for the same cost', async () => {
    const { recordId, vet } = await setup();
    await service.adjustVisitCost(vet, recordId, {
      cost: 15_000_000,
      reason: 'Kiểm lại',
    });
    expect(await audits()).toEqual([]);
    expect(await outbox()).toEqual([]);
  });

  it('answers conflict for a voided visit, a read-only horse, and not found for a missing visit', async () => {
    const { recordId, vet } = await setup();
    await dataSource.query(
      `UPDATE medical_records SET voided_at = now(), void_reason = 'Sai' WHERE id = $1`,
      [recordId],
    );
    await expect(
      service.adjustVisitCost(vet, recordId, { cost: 1, reason: 'x' }),
    ).rejects.toBeInstanceOf(ConflictException);
    await expect(
      service.adjustVisitCost(vet, randomUUID(), { cost: 1, reason: 'x' }),
    ).rejects.toBeInstanceOf(NotFoundException);

    await truncateAllTables(dataSource);
    const deceased = await setup(HorseLifecycleStatus.DECEASED);
    await expect(
      service.adjustVisitCost(deceased.vet, deceased.recordId, {
        cost: 1,
        reason: 'x',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(await costOf(deceased.recordId)).toBe('15000000');
    expect(await outbox()).toEqual([]);
  });
});

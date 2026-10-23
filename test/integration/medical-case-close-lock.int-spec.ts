import { BadRequestException } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { Test, type TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { UserRole } from '../../src/common/enums/role.enum';
import { DomainEventsModule } from '../../src/common/infrastructure/events/domain-events.module';
import type { Actor } from '../../src/common/types/actor';
import {
  CaseLockDecision,
  MedicalCaseStatus,
} from '../../src/modules/medical/constants/medical-case.enum';
import {
  MEDICAL_TRAINING_LOCK_KEPT_EVENT,
  MEDICAL_TRAINING_LOCK_RELEASED_EVENT,
} from '../../src/modules/medical/constants/medical-events.constants';
import { MedicalCasesService } from '../../src/modules/medical/medical-records/medical-cases.service';
import { MedicalRecordsModule } from '../../src/modules/medical/medical-records/medical-records.module';
import { fixtures } from './fixtures';
import {
  startTestPostgres,
  truncateAllTables,
  type TestPostgres,
} from './postgres';

const DAY_MS = 86_400_000;

describe('MedicalCasesService close with the active training lock of the horse (Postgres)', () => {
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

  const setup = async (lockFromClosedCase: boolean) => {
    const vet = await seed.user(UserRole.VETERINARIAN);
    const [user] = await dataSource.query<{ keycloak_id: string }[]>(
      'SELECT keycloak_id FROM users WHERE id = $1',
      [vet],
    );
    const actor: Actor = {
      sub: user.keycloak_id,
      roles: [UserRole.VETERINARIAN],
    };
    const horse = await seed.horse('Winx');
    const first = lockFromClosedCase
      ? await seed.medicalCase(horse, vet, {
          status: MedicalCaseStatus.CLOSED,
          openedAt: new Date(Date.now() - 10 * DAY_MS).toISOString(),
          closedAt: new Date(Date.now() - 5 * DAY_MS).toISOString(),
        })
      : null;
    const caseId = await seed.medicalCase(horse, vet);
    const [lock] = await dataSource.query<{ id: string }[]>(
      `INSERT INTO training_locks (version, horse_id, locked_by, reason, lock_start, lock_end, status, case_id)
       VALUES (1, $1, $2, 'Viêm gân', now() - interval '6 days', now() + interval '1 day', 'ACTIVE', $3)
       RETURNING id`,
      [horse, vet, first ?? caseId],
    );
    return { actor, caseId, first, lockId: lock.id };
  };

  const lockRow = (id: string) =>
    dataSource
      .query<{ status: string; case_id: string; lock_end: Date | null }[]>(
        'SELECT status, case_id, lock_end FROM training_locks WHERE id = $1',
        [id],
      )
      .then((rows) => rows[0]);

  const eventNames = () =>
    dataSource
      .query<{ event_name: string }[]>('SELECT event_name FROM outbox_events')
      .then((rows) => rows.map((row) => row.event_name));

  it('previews the lock kept from an earlier closed case when closing the next case', async () => {
    const { actor, caseId, lockId } = await setup(true);

    const preview = await service.closePreview(actor, caseId);

    expect(preview.activeLock).toMatchObject({ id: lockId });
  });

  it('asks what to do with the lock kept from an earlier closed case', async () => {
    const { actor, caseId } = await setup(true);

    await expect(
      service.closeCase(actor, caseId, { finalConclusion: 'Khỏi' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('releases the lock kept from an earlier closed case without moving it to the closing case', async () => {
    const { actor, caseId, first, lockId } = await setup(true);

    await service.closeCase(actor, caseId, {
      finalConclusion: 'Khỏi',
      lockDecision: CaseLockDecision.RELEASE,
    });

    expect(await lockRow(lockId)).toMatchObject({
      status: 'RELEASED',
      case_id: first,
    });
    expect(await eventNames()).toContain(MEDICAL_TRAINING_LOCK_RELEASED_EVENT);
    const [audit] = await dataSource.query<
      { after_data: Record<string, unknown> }[]
    >(
      `SELECT after_data FROM audit_logs
        WHERE entity_type = 'MEDICAL_CASE' AND entity_id = $1`,
      [caseId],
    );
    expect(audit.after_data).toMatchObject({ trainingLockId: lockId });
  });

  it('keeps the lock kept from an earlier closed case with the new expected end', async () => {
    const { actor, caseId, first, lockId } = await setup(true);
    const lockExpectedEnd = new Date(Date.now() + 10 * DAY_MS).toISOString();

    await service.closeCase(actor, caseId, {
      finalConclusion: 'Đỡ',
      lockDecision: CaseLockDecision.KEEP,
      lockExpectedEnd,
    });

    const row = await lockRow(lockId);
    expect(row).toMatchObject({ status: 'ACTIVE', case_id: first });
    expect(row.lock_end?.toISOString()).toBe(lockExpectedEnd);
    expect(await eventNames()).toContain(MEDICAL_TRAINING_LOCK_KEPT_EVENT);
  });

  it('still handles the lock of the closing case itself', async () => {
    const { actor, caseId, lockId } = await setup(false);

    expect(
      (await service.closePreview(actor, caseId)).activeLock,
    ).toMatchObject({ id: lockId });
    await service.closeCase(actor, caseId, {
      finalConclusion: 'Khỏi',
      lockDecision: CaseLockDecision.RELEASE,
    });

    expect(await lockRow(lockId)).toMatchObject({
      status: 'RELEASED',
      case_id: caseId,
    });
  });
});

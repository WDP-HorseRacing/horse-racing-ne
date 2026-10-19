import { randomUUID } from 'node:crypto';
import { ConflictException } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { Test, type TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { UserRole } from '../../../src/common/enums/role.enum';
import { DomainEventsModule } from '../../../src/common/infrastructure/events/domain-events.module';
import type { Actor } from '../../../src/common/types/actor';
import { clubToday } from '../../../src/common/utils/club-date';
import { HorseHealthStatus } from '../../../src/modules/horses/enums/horse-status.enum';
import { CareSchedulesModule } from '../../../src/modules/medical/care-schedules/care-schedules.module';
import { CareSchedulesService } from '../../../src/modules/medical/care-schedules/care-schedules.service';
import {
  CareAssigneeType,
  CareScheduleStatus,
  CareScheduleType,
} from '../../../src/modules/medical/constants/care-schedule.enum';
import {
  MedicalVisitConclusion,
  MedicalVisitKind,
} from '../../../src/modules/medical/constants/medical-visit.enum';
import { MedicalCasesService } from '../../../src/modules/medical/medical-records/medical-cases.service';
import { MedicalRecordsModule } from '../../../src/modules/medical/medical-records/medical-records.module';
import { MedicalVisitsService } from '../../../src/modules/medical/medical-records/medical-visits.service';
import { fixtures } from '../fixtures';
import {
  startTestPostgres,
  truncateAllTables,
  type TestPostgres,
} from '../postgres';

const DAY_MS = 24 * 60 * 60 * 1000;

describe('Medical findings (Postgres)', () => {
  let db: TestPostgres;
  let dataSource: DataSource;
  let moduleRef: TestingModule;
  let seed: ReturnType<typeof fixtures>;
  let visits: MedicalVisitsService;
  let cases: MedicalCasesService;
  let careSchedules: CareSchedulesService;

  const actorOf = async (userId: string, role: UserRole): Promise<Actor> => {
    const [row] = await dataSource.query<{ keycloak_id: string }[]>(
      'SELECT keycloak_id FROM users WHERE id = $1',
      [userId],
    );
    return { sub: row.keycloak_id, roles: [role] };
  };

  const newVet = async () => {
    const id = await seed.user(UserRole.VETERINARIAN);
    return { id, actor: await actorOf(id, UserRole.VETERINARIAN) };
  };

  const horseHealth = async (horseId: string): Promise<string> => {
    const [row] = await dataSource.query<{ health_status: string }[]>(
      'SELECT health_status FROM horses WHERE id = $1',
      [horseId],
    );
    return row.health_status;
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
        CareSchedulesModule,
      ],
    }).compile();
    visits = moduleRef.get(MedicalVisitsService);
    cases = moduleRef.get(MedicalCasesService);
    careSchedules = moduleRef.get(CareSchedulesService);
  });

  afterAll(async () => {
    await moduleRef?.close();
    await db?.container.stop();
  });

  beforeEach(() => truncateAllTables(dataSource));

  it('B5: every visit is recorded at the current time, so the latest visit sets the current health status', async () => {
    const vetA = await newVet();
    const vetB = await newVet();
    const horse = await seed.horse('Winx');

    const first = await visits.createStandaloneVisit(vetA.actor, horse, {
      kind: MedicalVisitKind.ROUTINE,
      conclusion: MedicalVisitConclusion.NORMAL,
      healthStatus: HorseHealthStatus.ELIGIBLE,
    });
    const before = Date.now();
    const second = await visits.createStandaloneVisit(vetB.actor, horse, {
      kind: MedicalVisitKind.ROUTINE,
      conclusion: MedicalVisitConclusion.NORMAL,
      healthStatus: HorseHealthStatus.INJURED,
      healthReason: 'Sưng gân',
    });

    expect(second.examDate.getTime()).toBeGreaterThanOrEqual(before);
    expect(second.examDate.getTime()).toBeGreaterThanOrEqual(
      first.examDate.getTime(),
    );
    expect(await horseHealth(horse)).toBe(HorseHealthStatus.INJURED);
  });

  it('F3-1: cost of a visit in a case closed recording a death can still be adjusted', async () => {
    const vet = await newVet();
    const horse = await seed.horse('Winx');
    const caseId = await seed.medicalCase(horse, vet.id);
    const recordId = await seed.visit(horse, vet.id, new Date().toISOString(), {
      caseId,
      cost: 50_000_000,
    });
    await cases.closeCase(vet.actor, caseId, {
      finalConclusion: 'Ngựa mất',
      dateOfDeath: clubToday(),
    });

    await expect(
      visits.adjustVisitCost(vet.actor, recordId, {
        cost: 5_000_000,
        reason: 'Gõ nhầm số',
      }),
    ).resolves.toMatchObject({ cost: 5_000_000 });
  });

  it('F3-5: voiding a visit outside any case is audited with the standalone visit feature', async () => {
    const vet = await newVet();
    const horse = await seed.horse('Winx');
    const visitId = await seed.visit(
      horse,
      vet.id,
      new Date(Date.now() - 60_000).toISOString(),
    );

    await visits.voidVisit(vet.actor, visitId, { reason: 'Ghi nhầm' });

    const rows = await dataSource.query<{ feature: string }[]>(
      `SELECT feature FROM audit_logs
        WHERE entity_type = 'MEDICAL_RECORD' AND entity_id = $1`,
      [visitId],
    );
    expect(rows.map((row) => row.feature)).toEqual(['MED_VISIT']);
  });

  it('B17: a second scheduled care schedule of the same type for one horse is rejected with 409', async () => {
    const vet = await newVet();
    const horse = await seed.horse('Winx');
    const dueAt = new Date(Date.now() + 7 * DAY_MS).toISOString();

    await careSchedules.create(vet.actor, horse, {
      type: CareScheduleType.DEWORMING,
      dueAt,
    });

    await expect(
      careSchedules.create(vet.actor, horse, {
        type: CareScheduleType.DEWORMING,
        dueAt,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('B18: voiding the visit restores the routine checkup appointment it completed', async () => {
    const vet = await newVet();
    const horse = await seed.horse('Winx');
    const appointment = await seed.schedule(
      horse,
      new Date(Date.now() + DAY_MS).toISOString(),
      { type: CareScheduleType.ROUTINE_CHECKUP },
    );
    const visit = await visits.createStandaloneVisit(vet.actor, horse, {
      kind: MedicalVisitKind.ROUTINE,
      conclusion: MedicalVisitConclusion.NORMAL,
    });
    const [completed] = await dataSource.query<{ status: string }[]>(
      'SELECT status FROM care_schedules WHERE id = $1',
      [appointment],
    );
    expect(completed.status).toBe(CareScheduleStatus.COMPLETED);

    await visits.voidVisit(vet.actor, visit.id, { reason: 'Ghi nhầm ngựa' });

    const open = await dataSource.query<{ id: string }[]>(
      `SELECT id FROM care_schedules
        WHERE horse_id = $1 AND type = 'ROUTINE_CHECKUP' AND status = 'SCHEDULED'`,
      [horse],
    );
    expect(open).toHaveLength(1);
  });

  it('F3-4: a replacement visit for a voided request-based visit can be recorded', async () => {
    const vet = await newVet();
    const horse = await seed.horse('Winx');
    const request = await seed.examRequest(horse);
    const first = await visits.createStandaloneVisit(vet.actor, horse, {
      kind: MedicalVisitKind.REQUEST,
      conclusion: MedicalVisitConclusion.NORMAL,
      requestIds: [request],
    });
    await visits.voidVisit(vet.actor, first.id, {
      reason: 'Nhập nhầm thân nhiệt',
    });

    await expect(
      visits.createStandaloneVisit(vet.actor, horse, {
        kind: MedicalVisitKind.REQUEST,
        conclusion: MedicalVisitConclusion.NORMAL,
        replacesRecordId: first.id,
      }),
    ).resolves.toMatchObject({ replacesRecordId: first.id });
  });

  it('F3-2: a date of death earlier than the latest non-voided visit is rejected with 400', async () => {
    const vet = await newVet();
    const horse = await seed.horse('Winx');
    const caseId = await seed.medicalCase(horse, vet.id, {
      openedAt: new Date(Date.now() - 3 * DAY_MS).toISOString(),
    });
    await seed.visit(
      horse,
      vet.id,
      new Date(Date.now() - 60_000).toISOString(),
      {
        caseId,
      },
    );
    const yesterday = new Date(`${clubToday()}T00:00:00Z`);
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);

    await expect(
      cases.closeCase(vet.actor, caseId, {
        finalConclusion: 'Ngựa mất',
        dateOfDeath: yesterday.toISOString().slice(0, 10),
      }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('N7: a GROOM cannot be assigned a VACCINATION care schedule nor complete it', async () => {
    const vet = await newVet();
    const groomId = await seed.user(UserRole.GROOM);
    const groom = await actorOf(groomId, UserRole.GROOM);
    const horse = await seed.horse('Winx');
    await dataSource.query(
      `INSERT INTO groom_assignments (id, version, horse_id, groom_id, start_at)
       VALUES ($1, 1, $2, $3, now())`,
      [randomUUID(), horse, groomId],
    );

    const outcome = await careSchedules
      .create(vet.actor, horse, {
        type: CareScheduleType.VACCINATION,
        dueAt: new Date(Date.now() + DAY_MS).toISOString(),
        assigneeType: CareAssigneeType.GROOM,
        assignedTo: groomId,
      })
      .then((schedule) =>
        careSchedules.complete(groom, schedule.id, {}).then(
          () => 'groom completed vaccination',
          (error: Error) => `complete rejected: ${error.message}`,
        ),
      )
      .catch((error: Error) => `assign rejected: ${error.message}`);

    expect(outcome).not.toBe('groom completed vaccination');
  });
});

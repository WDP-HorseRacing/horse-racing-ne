import { NotFoundException } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { Test, type TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { UserRole } from '../../src/common/enums/role.enum';
import { DomainEventsModule } from '../../src/common/infrastructure/events/domain-events.module';
import type { Actor } from '../../src/common/types/actor';
import { clubToday, shiftDays } from '../../src/common/utils/club-date';
import { FollowUpSchedules1789829700000 } from '../../src/migrations/1789829700000-FollowUpSchedules';
import { CareSchedulesService } from '../../src/modules/medical/care-schedules/care-schedules.service';
import {
  CareScheduleStatus,
  CareScheduleType,
} from '../../src/modules/medical/constants/care-schedule.enum';
import { MedicalCaseStatus } from '../../src/modules/medical/constants/medical-case.enum';
import {
  MedicalVisitConclusion,
  MedicalVisitKind,
} from '../../src/modules/medical/constants/medical-visit.enum';
import { MedicalDashboardRepository } from '../../src/modules/medical/medical-dashboard/medical-dashboard.repository';
import { MedicalCasesService } from '../../src/modules/medical/medical-records/medical-cases.service';
import { MedicalRecordsService } from '../../src/modules/medical/medical-records/medical-records.service';
import { MedicalVisitEditsService } from '../../src/modules/medical/medical-records/medical-visit-edits.service';
import { MedicalVisitsService } from '../../src/modules/medical/medical-records/medical-visits.service';
import { MedicalModule } from '../../src/modules/medical/medical.module';
import { MedicalCheckupsService } from '../../src/modules/medical/shared/medical-checkups.service';
import { GroomTodayService } from '../../src/modules/stable/daily-checklists/groom-today.service';
import { fixtures } from './fixtures';
import {
  startTestPostgres,
  truncateAllTables,
  type TestPostgres,
} from './postgres';

const DAY_MS = 24 * 60 * 60 * 1000;

type FollowUpRow = {
  record_id: string;
  case_id: string;
  status: CareScheduleStatus;
  due_at: Date;
  completed_by: string | null;
  cancel_reason: string | null;
  assigned_to: string | null;
};

describe('Follow-up appointments in care_schedules (Postgres)', () => {
  let db: TestPostgres;
  let dataSource: DataSource;
  let moduleRef: TestingModule;
  let seed: ReturnType<typeof fixtures>;
  let visits: MedicalVisitsService;
  let edits: MedicalVisitEditsService;
  let cases: MedicalCasesService;
  let records: MedicalRecordsService;
  let careSchedules: CareSchedulesService;
  let vetId: string;
  let vet: Actor;
  let horse: string;

  const actorOf = async (id: string, role: UserRole): Promise<Actor> => {
    const [row] = await dataSource.query<{ keycloak_id: string }[]>(
      'SELECT keycloak_id FROM users WHERE id = $1',
      [id],
    );
    return { sub: row.keycloak_id, roles: [role] };
  };

  const isoIn = (days: number) =>
    new Date(Date.now() + days * DAY_MS).toISOString();

  const followUps = () =>
    dataSource.query<FollowUpRow[]>(
      `SELECT s.record_id, s.case_id, s.status, s.due_at, s.completed_by, s.cancel_reason, s.assigned_to
         FROM care_schedules s
         JOIN medical_records r ON r.id = s.record_id
        WHERE s.type = 'FOLLOW_UP'
        ORDER BY r.exam_date`,
    );

  const openCase = async (nextVisitAt?: string) => {
    const visit = await visits.createStandaloneVisit(vet, horse, {
      kind: MedicalVisitKind.ROUTINE,
      conclusion: MedicalVisitConclusion.ISSUE,
      initialDiagnosis: 'Viêm gân',
      ...(nextVisitAt ? { nextVisitAt } : {}),
    });
    return { visit, caseId: visit.caseId as string };
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
        MedicalModule,
      ],
    }).compile();
    const get = <T>(token: new (...args: never[]) => T): T =>
      moduleRef.get(token, { strict: false });
    visits = get(MedicalVisitsService);
    edits = get(MedicalVisitEditsService);
    cases = get(MedicalCasesService);
    records = get(MedicalRecordsService);
    careSchedules = get(CareSchedulesService);
  });

  afterAll(async () => {
    await moduleRef?.close();
    await db?.container.stop();
  });

  beforeEach(async () => {
    await truncateAllTables(dataSource);
    vetId = await seed.user(UserRole.VETERINARIAN);
    vet = await actorOf(vetId, UserRole.VETERINARIAN);
    horse = await seed.horse('Gió');
  });

  it('books an unassigned follow-up when a visit opens a case with a next visit date, and shows it on the visit and the dashboard', async () => {
    const nextVisitAt = isoIn(3);
    const { visit, caseId } = await openCase(nextVisitAt);

    expect(visit.nextVisitAt).toEqual(new Date(nextVisitAt));
    await expect(followUps()).resolves.toEqual([
      expect.objectContaining({
        record_id: visit.id,
        case_id: caseId,
        status: CareScheduleStatus.SCHEDULED,
        due_at: new Date(nextVisitAt),
        assigned_to: null,
      }),
    ]);
    const [dashboardCase] = await new MedicalDashboardRepository(
      dataSource,
    ).openCases([horse]);
    expect(dashboardCase.nextVisitAt).toEqual(new Date(nextVisitAt));
    const [listed] = await records.listRecords(vet, horse);
    expect(listed.nextVisitAt).toEqual(new Date(nextVisitAt));
  });

  it('completes the open follow-up when the next visit of the case is recorded, and books the new one', async () => {
    const { visit: first, caseId } = await openCase(isoIn(3));
    const nextVisitAt = isoIn(7);
    const second = await visits.createFollowUpVisit(vet, caseId, {
      diagnosis: 'Đỡ',
      nextVisitAt,
    });

    const [old, latest] = await followUps();
    expect(old).toMatchObject({
      record_id: first.id,
      status: CareScheduleStatus.COMPLETED,
      completed_by: vetId,
    });
    expect(latest).toMatchObject({
      record_id: second.id,
      status: CareScheduleStatus.SCHEDULED,
    });
    const [dashboardCase] = await new MedicalDashboardRepository(
      dataSource,
    ).openCases([horse]);
    expect(dashboardCase.nextVisitAt).toEqual(new Date(nextVisitAt));
  });

  it('moves the follow-up when the visit date is edited, removes it when cleared, and logs both values', async () => {
    const { visit } = await openCase(isoIn(3));
    const moved = isoIn(5);

    const edited = await edits.editVisit(vet, visit.id, {
      reason: 'Đổi ngày',
      nextVisitAt: moved,
    });
    expect(edited.nextVisitAt).toEqual(new Date(moved));
    await expect(followUps()).resolves.toEqual([
      expect.objectContaining({
        status: CareScheduleStatus.SCHEDULED,
        due_at: new Date(moved),
      }),
    ]);

    await edits.editVisit(vet, visit.id, {
      reason: 'Không cần tái khám',
      nextVisitAt: null,
    });
    await expect(followUps()).resolves.toEqual([]);
    const audits = await dataSource.query<
      { before: string | null; after: string | null }[]
    >(
      `SELECT before_data->>'nextVisitAt' AS before, after_data->>'nextVisitAt' AS after
         FROM audit_logs
        WHERE entity_id = $1 AND before_data ? 'nextVisitAt'
        ORDER BY created_at`,
      [visit.id],
    );
    expect(audits).toEqual([
      {
        before: expect.any(String) as unknown,
        after: new Date(moved).toISOString(),
      },
      { before: new Date(moved).toISOString(), after: null },
    ]);
  });

  it('cancels the follow-up of a voided visit and reopens the previous one', async () => {
    const { visit: first, caseId } = await openCase(isoIn(3));
    const second = await visits.createFollowUpVisit(vet, caseId, {
      nextVisitAt: isoIn(7),
    });

    await visits.voidVisit(vet, second.id, { reason: 'Ghi nhầm' });

    const [old, voided] = await followUps();
    expect(old).toMatchObject({
      record_id: first.id,
      status: CareScheduleStatus.SCHEDULED,
      completed_by: null,
    });
    expect(voided).toMatchObject({
      record_id: second.id,
      status: CareScheduleStatus.CANCELLED,
      cancel_reason: 'Buổi khám đặt lịch đã hủy',
    });
  });

  it('cancels the open follow-up when the case is closed', async () => {
    const { caseId } = await openCase(isoIn(3));

    await cases.closeCase(vet, caseId, { finalConclusion: 'Khỏi' });

    await expect(followUps()).resolves.toEqual([
      expect.objectContaining({
        status: CareScheduleStatus.CANCELLED,
        cancel_reason: 'Bệnh án đã đóng',
      }),
    ]);
    await expect(
      new MedicalDashboardRepository(dataSource).openCases([horse]),
    ).resolves.toEqual([]);
  });

  it('cancels the follow-up when the case is cancelled by voiding its opening visit', async () => {
    const { visit } = await openCase(isoIn(3));

    await visits.voidVisit(vet, visit.id, { reason: 'Mở nhầm' });

    await expect(followUps()).resolves.toEqual([
      expect.objectContaining({ status: CareScheduleStatus.CANCELLED }),
    ]);
  });

  it('keeps follow-ups out of care schedule routes and the care schedule due list, but reminds and shows them to the groom', async () => {
    const groomId = await seed.user(UserRole.GROOM);
    await dataSource.query(
      `INSERT INTO groom_assignments (version, horse_id, groom_id, start_at)
       VALUES (1, $1, $2, now())`,
      [horse, groomId],
    );
    const { caseId } = await openCase(isoIn(0.001));
    const [row] = await dataSource.query<{ id: string }[]>(
      `SELECT id FROM care_schedules WHERE case_id = $1`,
      [caseId],
    );

    await expect(careSchedules.list(vet, horse)).resolves.toEqual([]);
    await expect(careSchedules.complete(vet, row.id, {})).rejects.toThrow(
      NotFoundException,
    );
    const checkups = new MedicalCheckupsService(dataSource);
    await expect(
      checkups.dueCareSchedules(shiftDays(clubToday(), 3)),
    ).resolves.toEqual([]);
    await expect(
      checkups.dueAppointments(shiftDays(clubToday(), 1)),
    ).resolves.toEqual([
      expect.objectContaining({ id: row.id, type: CareScheduleType.FOLLOW_UP }),
    ]);
    const today = await new GroomTodayService(dataSource).today(
      await actorOf(groomId, UserRole.GROOM),
    );
    expect(today.horseVetAppointments).toEqual([
      expect.objectContaining({ id: row.id, type: CareScheduleType.FOLLOW_UP }),
    ]);
  });

  describe('migration FollowUpSchedules', () => {
    const migration = new FollowUpSchedules1789829700000();

    it('turns each visit next visit date into a follow-up with the derived status and back on down', async () => {
      const otherVet = await seed.user(UserRole.VETERINARIAN);
      const runner = dataSource.createQueryRunner();
      try {
        await migration.down(runner);
        const openCaseId = await seed.medicalCase(horse, vetId);
        const closed = await seed.horse('Mây');
        const closedCaseId = await seed.medicalCase(closed, vetId, {
          status: MedicalCaseStatus.CLOSED,
          closedAt: '2026-10-10T02:00:00Z',
        });
        const insertVisit = async (
          horseId: string,
          caseId: string,
          vet: string,
          examDate: string,
          nextVisitAt: string | null,
          voided = false,
        ) => {
          const [row] = (await runner.query(
            `INSERT INTO medical_records (horse_id, vet_id, exam_date, resulting_status, kind, case_id, next_visit_at, voided_at, cost)
             VALUES ($1, $2, $3, 'ELIGIBLE', 'FOLLOW_UP', $4, $5, $6, 0) RETURNING id`,
            [
              horseId,
              vet,
              examDate,
              caseId,
              nextVisitAt,
              voided ? new Date() : null,
            ],
          )) as { id: string }[];
          return row.id;
        };
        const done = await insertVisit(
          horse,
          openCaseId,
          vetId,
          '2026-10-01T02:00:00Z',
          '2026-10-05T02:00:00Z',
        );
        const voided = await insertVisit(
          horse,
          openCaseId,
          vetId,
          '2026-10-03T02:00:00Z',
          '2026-10-06T02:00:00Z',
          true,
        );
        await insertVisit(
          horse,
          openCaseId,
          otherVet,
          '2026-10-04T02:00:00Z',
          null,
        );
        const pending = await insertVisit(
          horse,
          openCaseId,
          vetId,
          '2026-10-08T02:00:00Z',
          '2026-10-01T02:00:00Z',
        );
        const closedLast = await insertVisit(
          closed,
          closedCaseId,
          vetId,
          '2026-10-09T02:00:00Z',
          '2026-10-20T02:00:00Z',
        );

        await migration.up(runner);

        const rows = await followUps();
        const byRecord = Object.fromEntries(
          rows.map((row) => [row.record_id, row]),
        );
        expect(Object.keys(byRecord).sort()).toEqual(
          [done, voided, pending, closedLast].sort(),
        );
        expect(byRecord[done]).toMatchObject({
          status: CareScheduleStatus.COMPLETED,
          completed_by: otherVet,
        });
        expect(byRecord[voided]).toMatchObject({
          status: CareScheduleStatus.CANCELLED,
          cancel_reason: 'Buổi khám đặt lịch đã hủy',
        });
        expect(byRecord[pending]).toMatchObject({
          status: CareScheduleStatus.SCHEDULED,
          due_at: new Date('2026-10-01T02:00:00Z'),
        });
        expect(byRecord[closedLast]).toMatchObject({
          status: CareScheduleStatus.CANCELLED,
          cancel_reason: 'Bệnh án đã đóng',
        });

        await migration.down(runner);
        const restored = (await runner.query(
          `SELECT id, next_visit_at FROM medical_records WHERE id = ANY($1::uuid[]) ORDER BY exam_date`,
          [[done, pending]],
        )) as { id: string; next_visit_at: Date }[];
        expect(restored).toEqual([
          { id: done, next_visit_at: new Date('2026-10-05T02:00:00Z') },
          { id: pending, next_visit_at: new Date('2026-10-01T02:00:00Z') },
        ]);
        await expect(
          runner.query(`SELECT 1 FROM care_schedules WHERE type = 'FOLLOW_UP'`),
        ).resolves.toEqual([]);
      } finally {
        await migration.up(runner).catch(() => undefined);
        await runner.release();
      }
    });
  });
});

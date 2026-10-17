import { BadRequestException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { UserRole } from '../../../src/common/enums/role.enum';
import { DomainEventPublisher } from '../../../src/common/infrastructure/events/domain-event.publisher';
import type { Actor } from '../../../src/common/types/actor';
import {
  clubDateTimeToInstant,
  shiftDays,
} from '../../../src/common/utils/club-date';
import { AuditService } from '../../../src/modules/audit/services/audit.service';
import { DailyFeesService } from '../../../src/modules/billing/daily-fees/daily-fees.service';
import { DailyFeeEntity } from '../../../src/modules/billing/entities/daily-fee.entity';
import { HorseMeasurementEntity } from '../../../src/modules/horses/entities/horse-measurement.entity';
import { HorseMeasurementType } from '../../../src/modules/horses/enums/horse-measurement-type.enum';
import { HorseMeasurementsService } from '../../../src/modules/horses/horse-measurements/horse-measurements.service';
import { HorseAccessService } from '../../../src/modules/horses/shared/horse-access.service';
import { MedicalCheckupsService } from '../../../src/modules/medical/shared/medical-checkups.service';
import { FinanceReportsRepository } from '../../../src/modules/reports/finance-reports/finance-reports.repository';
import { FinanceReportsService } from '../../../src/modules/reports/finance-reports/finance-reports.service';
import { CareTasksService } from '../../../src/modules/stable/care-tasks/care-tasks.service';
import { ChecklistsService } from '../../../src/modules/stable/daily-checklists/checklists.service';
import { GroomTodayService } from '../../../src/modules/stable/daily-checklists/groom-today.service';
import { CareTaskTypeEntity } from '../../../src/modules/stable/entities/care-task-type.entity';
import { DailyChecklistEntity } from '../../../src/modules/stable/entities/daily-checklist.entity';
import { HorseCareTaskEntity } from '../../../src/modules/stable/entities/horse-care-task.entity';
import { DailyChecklistsService } from '../../../src/modules/stable/shared/daily-checklists.service';
import { StableAccessService } from '../../../src/modules/stable/shared/stable-access.service';
import { TrainingClassEntity } from '../../../src/modules/training/entities/training-class.entity';
import { TrainingAccessService } from '../../../src/modules/training/shared/training-access.service';
import { TrainingClassesService } from '../../../src/modules/training/training-classes/services/training-classes.service';
import { CareScheduleType } from '../../../src/modules/medical/constants/care-schedule.enum';
import { fixtures } from '../fixtures';
import {
  startTestPostgres,
  stopTestPostgres,
  truncateAllTables,
  type TestPostgres,
} from '../postgres';

/** Ngày CLB cố định dùng làm "hôm nay" trong mọi test */
const D = '2026-10-15';
const FEE_OLD = 100000;
const FEE_NEW = 150000;

const fakeNow = (clubDate: string, clubTime: string) =>
  jest.useFakeTimers({
    now: clubDateTimeToInstant(clubDate, clubTime),
    doNotFake: [
      'nextTick',
      'setImmediate',
      'clearImmediate',
      'setInterval',
      'clearInterval',
      'setTimeout',
      'clearTimeout',
      'queueMicrotask',
      'hrtime',
      'performance',
    ],
  });

describe(`Timezone findings (process TZ=${process.env.TZ ?? Intl.DateTimeFormat().resolvedOptions().timeZone})`, () => {
  let db: TestPostgres;
  let dataSource: DataSource;
  let seed: ReturnType<typeof fixtures>;
  let checklists: ChecklistsService;
  let careTasks: CareTasksService;
  let groomToday: GroomTodayService;
  let fees: DailyFeesService;
  let finance: FinanceReportsService;
  let measurements: HorseMeasurementsService;
  let checkups: MedicalCheckupsService;
  let classes: TrainingClassesService;

  const actorOf = async (id: string, role: UserRole): Promise<Actor> => {
    const [row] = await dataSource.query<{ keycloak_id: string }[]>(
      'SELECT keycloak_id FROM users WHERE id = $1',
      [id],
    );
    return { sub: row.keycloak_id, roles: [role] };
  };

  const setDbTimeZone = async (tz: string) => {
    await dataSource.query(
      `ALTER DATABASE "${db.container.getDatabase()}" SET timezone TO '${tz}'`,
    );
    await dataSource.destroy();
    await dataSource.initialize();
    const [{ TimeZone }] =
      await dataSource.query<{ TimeZone: string }[]>('SHOW TIME ZONE');
    expect(TimeZone).toBe(tz);
  };

  beforeAll(async () => {
    db = await startTestPostgres();
    dataSource = db.dataSource;
    seed = fixtures(dataSource);
    const events = new DomainEventPublisher();
    const horseAccess = new HorseAccessService(dataSource);
    const stableAccess = new StableAccessService(horseAccess);
    const daily = new DailyChecklistsService(events);
    checklists = new ChecklistsService(
      dataSource.getRepository(DailyChecklistEntity),
      stableAccess,
      daily,
      dataSource,
      new AuditService(),
    );
    careTasks = new CareTasksService(
      dataSource.getRepository(CareTaskTypeEntity),
      dataSource.getRepository(HorseCareTaskEntity),
      stableAccess,
      daily,
      dataSource,
      new AuditService(),
    );
    groomToday = new GroomTodayService(dataSource);
    fees = new DailyFeesService(
      dataSource.getRepository(DailyFeeEntity),
      dataSource,
      new AuditService(),
    );
    finance = new FinanceReportsService(
      new FinanceReportsRepository(dataSource),
      dataSource,
    );
    measurements = new HorseMeasurementsService(
      dataSource.getRepository(HorseMeasurementEntity),
      horseAccess,
      dataSource,
      events,
      new AuditService(),
    );
    checkups = new MedicalCheckupsService(dataSource);
    classes = new TrainingClassesService(
      dataSource.getRepository(TrainingClassEntity),
      new TrainingAccessService(dataSource, horseAccess),
      dataSource,
      new AuditService(),
    );
  });

  afterAll(() => stopTestPostgres(db));

  afterEach(() => jest.useRealTimers());

  describe.each(['UTC', 'Asia/Ho_Chi_Minh'])(
    'DB session TimeZone=%s',
    (dbTz) => {
      let cm: Actor;
      let groomId: string;
      let groom: Actor;
      let trainerId: string;
      let trainer: Actor;
      let vet: Actor;
      let barn: string;
      let gio: string;

      beforeAll(() => setDbTimeZone(dbTz));

      beforeEach(async () => {
        await truncateAllTables(dataSource);
        cm = await actorOf(
          await seed.user(UserRole.CLUB_MANAGER),
          UserRole.CLUB_MANAGER,
        );
        trainerId = await seed.user(UserRole.HEAD_TRAINER);
        trainer = await actorOf(trainerId, UserRole.HEAD_TRAINER);
        groomId = await seed.user(UserRole.GROOM);
        groom = await actorOf(groomId, UserRole.GROOM);
        vet = await actorOf(
          await seed.user(UserRole.VETERINARIAN),
          UserRole.VETERINARIAN,
        );
        barn = await seed.barn('Khu A');
        await dataSource.query(
          'UPDATE barns SET head_trainer_id = $1 WHERE id = $2',
          [trainerId, barn],
        );
        gio = await seed.horse('Gió', { barnId: barn });
        await dataSource.query(
          `INSERT INTO groom_assignments (version, horse_id, groom_id, start_at)
         VALUES (1, $1, $2, '2026-01-01T00:00:00Z')`,
          [gio, groomId],
        );
      });

      const checklistRows = () =>
        dataSource.query<{ day: string; status: string }[]>(
          `SELECT to_char(checklist_date, 'YYYY-MM-DD') AS day, status
           FROM daily_checklists WHERE horse_id = $1 ORDER BY checklist_date`,
          [gio],
        );

      it('TZ-1: cron at 00:02 club time closes yesterday and generates the checklist of the new club day', async () => {
        await careTasks.createType(cm, { name: 'Cho ăn', appliesToAll: true });
        fakeNow(shiftDays(D, -1), '23:30');
        await checklists.runDaily();
        fakeNow(D, '00:02');

        await checklists.runDaily();

        expect(await checklistRows()).toEqual([
          { day: shiftDays(D, -1), status: 'INCOMPLETE' },
          { day: D, status: 'PENDING' },
        ]);
      });

      it('TZ-2: run at 06:00 club time (still the previous UTC day) targets the club day, and 23:59 keeps today open', async () => {
        await careTasks.createType(cm, { name: 'Cho ăn', appliesToAll: true });
        fakeNow(D, '06:00');
        await checklists.runDaily();
        fakeNow(D, '23:59');

        await checklists.runDaily();

        expect(await checklistRows()).toEqual([{ day: D, status: 'PENDING' }]);
      });

      it('TZ-3: groom-today at 06:00 club time uses the club day window for care schedules', async () => {
        const at = (date: string, time: string) =>
          clubDateTimeToInstant(date, time).toISOString();
        const overdue = await seed.schedule(
          gio,
          at(shiftDays(D, -1), '23:30'),
          {
            assignedTo: groomId,
          },
        );
        const earlyToday = await seed.schedule(gio, at(D, '00:30'), {
          assignedTo: groomId,
          type: CareScheduleType.DEWORMING,
        });
        await seed.schedule(gio, at(shiftDays(D, 1), '00:30'), {
          assignedTo: groomId,
          type: CareScheduleType.VACCINATION,
        });
        fakeNow(D, '06:00');

        const result = await groomToday.today(groom);

        expect(result.date).toBe(D);
        expect(
          result.horses[0].careSchedules.map((s) => [s.id, s.overdue]),
        ).toEqual([
          [overdue, true],
          [earlyToday, false],
        ]);
      });

      it('TZ-4 (B12): editing a class keeps an enrollment made at 00:30 club time on the start date valid', async () => {
        const { classId } = await seed.trainingClass(trainerId, {
          startDate: D,
          endDate: shiftDays(D, 27),
        });
        const horseId = await seed.horse('Winx', { barnId: barn });
        await dataSource.query(
          `INSERT INTO horse_enrollments (id, version, class_id, horse_id, status, enrolled_at)
         VALUES ($1, 1, $2, $3, 'ACTIVE', $4)`,
          [randomUUID(), classId, horseId, clubDateTimeToInstant(D, '00:30')],
        );

        const error = await classes
          .update(trainer, classId, { name: 'Đổi tên' })
          .then(
            () => null,
            (e: Error) => e.message,
          );

        expect(error).toBeNull();
      });

      it('TZ-5: finance report at 00:02 club time bills yesterday at the old fee and today at the new fee', async () => {
        await dataSource.query(
          `INSERT INTO daily_fees (effective_from, daily_fee, created_by)
         SELECT v.f::date, v.fee::bigint, u.id
           FROM (VALUES ('2026-01-01', $1), ($2, $3)) v(f, fee)
           CROSS JOIN (SELECT id FROM users WHERE role = 'CLUB_MANAGER' LIMIT 1) u`,
          [FEE_OLD, D, FEE_NEW],
        );
        const ownerId = await seed.user(UserRole.HORSE_OWNER);
        const horse = await seed.horse('Mây', { ownerId });
        await seed.ownership(
          horse,
          ownerId,
          clubDateTimeToInstant(shiftDays(D, -1), '00:30').toISOString(),
        );
        await seed.horseAudit(
          horse,
          {},
          { lifecycleStatus: 'ACTIVE' },
          '2026-01-01T00:00:00Z',
        );
        fakeNow(D, '00:02');

        const report = await finance.ownerCost(cm, {
          from: shiftDays(D, -2),
          to: D,
          ownerId,
        });

        const row = report.horses.find((h) => h.horseId === horse);
        expect(row?.billedDays).toBe(2);
        expect(Number(row?.dailyFee)).toBe(FEE_OLD + FEE_NEW);
      });

      it('TZ-6: at 00:02 club time a daily fee from today is accepted and one from yesterday is rejected', async () => {
        fakeNow(D, '00:02');

        await expect(
          fees.create(cm, { effectiveFrom: D, dailyFee: FEE_NEW }),
        ).resolves.toBeDefined();
        await expect(
          fees.create(cm, {
            effectiveFrom: shiftDays(D, -1),
            dailyFee: FEE_OLD,
          }),
        ).rejects.toBeInstanceOf(BadRequestException);
      });

      it('TZ-7: measuredAt without offset sent at 23:30 club time is read as club time, not as server time', async () => {
        fakeNow(D, '23:30');

        const result = await measurements
          .addMeasurements(vet, gio, {
            values: [{ type: HorseMeasurementType.WEIGHT, value: 450 }],
            measuredAt: `${D}T23:20:00`,
            confirmAbnormal: true,
          })
          .then(
            (rows) => new Date(rows[0].measuredAt).toISOString(),
            (e: Error) => `${e.constructor.name}: ${e.message}`,
          );

        expect(result).toBe(clubDateTimeToInstant(D, '23:20').toISOString());
      });

      it('TZ-8: reminders for club day D include a schedule due 23:30 on D and exclude one due 00:30 on D+1', async () => {
        const due = await seed.schedule(
          gio,
          clubDateTimeToInstant(D, '23:30').toISOString(),
          { type: CareScheduleType.VACCINATION },
        );
        await seed.schedule(
          gio,
          clubDateTimeToInstant(shiftDays(D, 1), '00:30').toISOString(),
          { type: CareScheduleType.DEWORMING },
        );

        const rows = await checkups.dueCareSchedules(D);

        expect(rows.map((r) => [r.scheduleId, r.dueDate])).toEqual([[due, D]]);
      });
    },
  );
});

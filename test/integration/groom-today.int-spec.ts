import { ForbiddenException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { UserRole } from '../../src/common/enums/role.enum';
import { UserStatus } from '../../src/common/enums/user-status.enum';
import { DomainEventPublisher } from '../../src/common/infrastructure/events/domain-event.publisher';
import type { Actor } from '../../src/common/types/actor';
import {
  clubDateTimeToInstant,
  clubToday,
  shiftDays,
} from '../../src/common/utils/club-date';
import { CareScheduleStatus } from '../../src/modules/medical/constants/care-schedule.enum';
import { DailyChecklistStatus } from '../../src/modules/stable/constants/daily-checklist-status.enum';
import { FeedingMeal } from '../../src/modules/stable/constants/feeding-meal.enum';
import { GroomTodayService } from '../../src/modules/stable/daily-checklists/groom-today.service';
import { DailyChecklistsService } from '../../src/modules/stable/shared/daily-checklists.service';
import { fixtures } from './fixtures';
import {
  startTestPostgres,
  stopTestPostgres,
  truncateAllTables,
  type TestPostgres,
} from './postgres';

describe('Groom today view (Postgres)', () => {
  let db: TestPostgres;
  let dataSource: DataSource;
  let seed: ReturnType<typeof fixtures>;
  let service: GroomTodayService;
  let groom: Actor;
  let groomId: string;
  let otherGroomId: string;
  let trainerId: string;
  let gio: string;
  let may: string;
  let today: string;

  const actorOf = async (id: string, role: UserRole): Promise<Actor> => {
    const [row] = await dataSource.query<{ keycloak_id: string }[]>(
      'SELECT keycloak_id FROM users WHERE id = $1',
      [id],
    );
    return { sub: row.keycloak_id, roles: [role] };
  };

  const assign = (horseId: string, id: string) =>
    dataSource.query(
      `INSERT INTO groom_assignments (version, horse_id, groom_id, start_at)
       VALUES (1, $1, $2, now())`,
      [horseId, id],
    );

  const run = async (
    classId: string,
    horseId: string,
    options: { start: Date; status?: string; groomId?: string; name?: string },
  ) => {
    const sessionId = randomUUID();
    await dataSource.query(
      `INSERT INTO training_sessions (id, version, class_id, name, scheduled_start_at, scheduled_end_at, status, intensity, planned_distance_m)
       VALUES ($1, 1, $2, $3, $4, $5, $6, 'MODERATE', 3000)`,
      [
        sessionId,
        classId,
        options.name ?? 'Buổi',
        options.start,
        new Date(options.start.getTime() + 3_600_000),
        options.status ?? 'SCHEDULED',
      ],
    );
    const [enrollment] = await dataSource.query<{ id: string }[]>(
      'SELECT id FROM horse_enrollments WHERE horse_id = $1',
      [horseId],
    );
    await dataSource.query(
      `INSERT INTO session_participants (version, session_id, horse_id, horse_enrollment_id, status, assigned_groom_id)
       VALUES (1, $1, $2, $3, 'PLANNED', $4)`,
      [sessionId, horseId, enrollment.id, options.groomId ?? groomId],
    );
  };

  beforeAll(async () => {
    db = await startTestPostgres();
    dataSource = db.dataSource;
    seed = fixtures(dataSource);
    service = new GroomTodayService(
      new DailyChecklistsService(new DomainEventPublisher()),
      dataSource,
    );
  });

  afterAll(() => stopTestPostgres(db));

  beforeEach(async () => {
    await truncateAllTables(dataSource);
    today = clubToday();
    groomId = await seed.user(UserRole.GROOM);
    otherGroomId = await seed.user(UserRole.GROOM);
    trainerId = await seed.user(UserRole.HEAD_TRAINER);
    groom = await actorOf(groomId, UserRole.GROOM);
    const barn = await seed.barn('Khu A');
    gio = await seed.horse('Gió', { barnId: barn });
    may = await seed.horse('Mây', { barnId: barn });
    const other = await seed.horse('Sấm', { barnId: barn });
    await assign(may, groomId);
    await assign(gio, groomId);
    await assign(other, otherGroomId);
    await dataSource.query(
      `INSERT INTO care_task_types (version, name, applies_to_all) VALUES (1, 'Cho ăn', true)`,
    );
  });

  it('rejects an inactive account with 403', async () => {
    const lockedId = await seed.user(UserRole.GROOM, UserStatus.INACTIVE);
    await expect(
      service.today(await actorOf(lockedId, UserRole.GROOM)),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('returns nothing for a groom without horses', async () => {
    const result = await service.today(
      await actorOf(await seed.user(UserRole.GROOM), UserRole.GROOM),
    );
    expect(result).toEqual({ date: today, horses: [] });
  });

  it('lists the groom horses by name with barn, stall and today checklist', async () => {
    const [stall] = await dataSource.query<{ id: string }[]>(
      `INSERT INTO stalls (version, barn_id, code)
       SELECT 1, barn_id, 'A-01' FROM horses WHERE id = $1 RETURNING id`,
      [gio],
    );
    await dataSource.query(
      `INSERT INTO stall_assignments (version, horse_id, stall_id, start_at)
       VALUES (1, $1, $2, now())`,
      [gio, stall.id],
    );

    const result = await service.today(groom);

    expect(result.date).toBe(today);
    expect(result.horses.map((horse) => horse.horseName)).toEqual([
      'Gió',
      'Mây',
    ]);
    expect(result.horses[0]).toMatchObject({
      barnName: 'Khu A',
      stallCode: 'A-01',
    });
    expect(result.horses[1].stallCode).toBeNull();
    expect(result.horses[0].checklist).toMatchObject({
      checklistDate: today,
      status: DailyChecklistStatus.PENDING,
    });
    expect(result.horses[0].checklist?.items.map((item) => item.name)).toEqual([
      'Cho ăn',
    ]);
  });

  it('shows only the active feeding plan', async () => {
    const [oats] = await dataSource.query<{ id: string }[]>(
      `INSERT INTO supply_items (version, name, category, unit)
       VALUES (1, 'Yến mạch', 'FEED', 'kg') RETURNING id`,
    );
    for (const status of ['ARCHIVED', 'ACTIVE', 'DRAFT']) {
      const [plan] = await dataSource.query<{ id: string }[]>(
        `INSERT INTO feeding_plans (version, horse_id, status, created_by, note)
         VALUES (1, $1, $2, $3, $4) RETURNING id`,
        [gio, status, trainerId, status],
      );
      await dataSource.query(
        `INSERT INTO feeding_plan_items (plan_id, meal, supply_item_id, quantity, position)
         VALUES ($1, $2, $3, 2, 0)`,
        [plan.id, FeedingMeal.NOON, oats.id],
      );
    }

    const [first, second] = (await service.today(groom)).horses;

    expect(first.feedingPlan?.note).toBe('ACTIVE');
    expect(first.feedingPlan?.meals[0].items[0].name).toBe('Yến mạch');
    expect(second.feedingPlan).toBeNull();
  });

  it('shows today runs the groom leads, skipping drafts, cancelled and other days', async () => {
    const { classId } = await seed.trainingClass(trainerId);
    for (const horseId of [gio, may]) {
      await dataSource.query(
        `INSERT INTO horse_enrollments (version, class_id, horse_id, status, enrolled_at)
         VALUES (1, $1, $2, 'ACTIVE', now())`,
        [classId, horseId],
      );
    }
    const at = (time: string, date = today) =>
      clubDateTimeToInstant(date, time);
    await run(classId, gio, { start: at('15:00'), name: 'Chiều' });
    await run(classId, gio, { start: at('06:00'), name: 'Sáng' });
    await run(classId, gio, { start: at('09:00'), status: 'DRAFT' });
    await run(classId, gio, { start: at('10:00'), status: 'CANCELLED' });
    await run(classId, gio, { start: at('06:00', shiftDays(today, 1)) });
    await run(classId, may, { start: at('07:00'), groomId: otherGroomId });

    const [first, second] = (await service.today(groom)).horses;

    expect(first.trainingRuns.map((item) => item.sessionName)).toEqual([
      'Sáng',
      'Chiều',
    ]);
    expect(second.trainingRuns).toEqual([]);
  });

  it('shows open care schedules due by the end of today, flagging overdue ones', async () => {
    const at = (date: string) => clubDateTimeToInstant(date, '12:00');
    await seed.schedule(gio, at(today).toISOString(), { assignedTo: groomId });
    await seed.schedule(gio, at(shiftDays(today, -2)).toISOString(), {
      assignedTo: groomId,
    });
    await seed.schedule(gio, at(shiftDays(today, 1)).toISOString(), {
      assignedTo: groomId,
    });
    await seed.schedule(gio, at(today).toISOString(), {
      assignedTo: groomId,
      status: CareScheduleStatus.COMPLETED,
    });
    await seed.schedule(gio, at(today).toISOString(), {
      assignedTo: otherGroomId,
    });

    const [first] = (await service.today(groom)).horses;

    expect(first.careSchedules.map((item) => item.overdue)).toEqual([
      true,
      false,
    ]);
  });
});

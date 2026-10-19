import { ConflictException } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';
import { Test, type TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { UserRole } from '../../src/common/enums/role.enum';
import { DomainEventsModule } from '../../src/common/infrastructure/events/domain-events.module';
import type { Actor } from '../../src/common/types/actor';
import { clubToday, shiftDays } from '../../src/common/utils/club-date';
import { HorseLifecycleStatus } from '../../src/modules/horses/enums/horse-status.enum';
import { HorseStatusesModule } from '../../src/modules/horses/horse-statuses/horse-statuses.module';
import { HorseStatusesService } from '../../src/modules/horses/horse-statuses/horse-statuses.service';
import { DailyChecklistStatus } from '../../src/modules/stable/constants/daily-checklist-status.enum';
import { FeedingPlanStatus } from '../../src/modules/stable/constants/feeding-plan-status.enum';
import { ChecklistsService } from '../../src/modules/stable/daily-checklists/checklists.service';
import { DailyChecklistsModule } from '../../src/modules/stable/daily-checklists/daily-checklists.module';
import { fixtures } from './fixtures';
import {
  startTestPostgres,
  truncateAllTables,
  type TestPostgres,
} from './postgres';

interface TaskRow {
  id: string;
  from_date: string;
  to_date: string;
}

describe('Horse lifecycle settles stable care (Postgres)', () => {
  let db: TestPostgres;
  let dataSource: DataSource;
  let moduleRef: TestingModule;
  let seed: ReturnType<typeof fixtures>;
  let statuses: HorseStatusesService;
  let checklists: ChecklistsService;
  let today: string;
  let cm: Actor;

  const actorOf = async (id: string, role: UserRole): Promise<Actor> => {
    const [row] = await dataSource.query<{ keycloak_id: string }[]>(
      'SELECT keycloak_id FROM users WHERE id = $1',
      [id],
    );
    return { sub: row.keycloak_id, roles: [role] };
  };

  const plan = async (horse: string, status: FeedingPlanStatus, by: string) => {
    const [row] = await dataSource.query<{ id: string }[]>(
      `INSERT INTO feeding_plans (version, horse_id, status, created_by)
       VALUES (1, $1, $2, $3) RETURNING id`,
      [horse, status, by],
    );
    const [supply] = await dataSource.query<{ id: string }[]>(
      `INSERT INTO supply_items (version, name, category, unit)
       VALUES (1, $1, 'FEED', 'kg') RETURNING id`,
      [`Yến mạch ${row.id}`],
    );
    await dataSource.query(
      `INSERT INTO feeding_plan_items (plan_id, meal, supply_item_id, quantity, position)
       VALUES ($1, 'NOON', $2, 2, 0)`,
      [row.id, supply.id],
    );
    return row.id;
  };

  const task = async (
    horse: string,
    taskType: string,
    mode: 'EXTRA' | 'EXEMPT',
    from: string,
    to: string,
    by: string,
  ) => {
    const [row] = await dataSource.query<{ id: string }[]>(
      `INSERT INTO horse_daily_tasks (horse_id, task_type_id, mode, from_date, to_date, created_by)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [horse, taskType, mode, from, to, by],
    );
    return row.id;
  };

  /** Ngựa có Groom, checklist hôm nay một việc đã tick, khẩu phần ACTIVE, nháp, ARCHIVED, việc riêng đủ bốn kiểu ngày */
  const stableHorse = async () => {
    const trainerId = await seed.user(UserRole.HEAD_TRAINER);
    const groomId = await seed.user(UserRole.GROOM);
    const barn = await seed.barn('Khu A');
    await dataSource.query(
      'UPDATE barns SET head_trainer_id = $1 WHERE id = $2',
      [trainerId, barn],
    );
    const owner = await seed.user(UserRole.HORSE_OWNER);
    const horse = await seed.horse('Gió', { barnId: barn, ownerId: owner });
    await seed.ownership(horse, owner, '2026-01-01T00:00:00Z');
    await dataSource.query(
      `INSERT INTO groom_assignments (version, horse_id, groom_id, start_at)
       VALUES (1, $1, $2, now() - interval '1 day')`,
      [horse, groomId],
    );
    const [feed, bath, ice] = await dataSource.query<{ id: string }[]>(
      `INSERT INTO daily_task_types (version, name, applies_to_all, active)
       VALUES (1, 'Cho ăn', true, true), (1, 'Tắm', true, true), (1, 'Ngâm đá', false, true)
       RETURNING id`,
    );
    const tasks = {
      running: await task(
        horse,
        ice.id,
        'EXTRA',
        shiftDays(today, -2),
        shiftDays(today, 3),
        trainerId,
      ),
      runningExempt: await task(
        horse,
        bath.id,
        'EXEMPT',
        today,
        shiftDays(today, 2),
        trainerId,
      ),
      endsToday: await task(
        horse,
        ice.id,
        'EXTRA',
        shiftDays(today, -6),
        today,
        trainerId,
      ),
      ended: await task(
        horse,
        ice.id,
        'EXTRA',
        shiftDays(today, -10),
        shiftDays(today, -8),
        trainerId,
      ),
      future: await task(
        horse,
        ice.id,
        'EXTRA',
        shiftDays(today, 5),
        shiftDays(today, 6),
        trainerId,
      ),
      futureExempt: await task(
        horse,
        bath.id,
        'EXEMPT',
        shiftDays(today, 4),
        shiftDays(today, 4),
        trainerId,
      ),
    };
    await checklists.generateDay(today);
    const items = await dataSource.query<
      { id: string; task_type_id: string }[]
    >(
      `SELECT i.id, i.task_type_id FROM daily_checklist_items i
         JOIN daily_checklists c ON c.id = i.checklist_id
        WHERE c.horse_id = $1`,
      [horse],
    );
    const groom = await actorOf(groomId, UserRole.GROOM);
    const ticked = items.find((i) => i.task_type_id === feed.id)!.id;
    const unticked = items.find((i) => i.task_type_id === ice.id)!.id;
    await checklists.tick(groom, ticked, { done: true });
    return {
      horse,
      groom,
      ticked,
      unticked,
      tasks,
      plans: {
        active: await plan(horse, FeedingPlanStatus.ACTIVE, trainerId),
        draft: await plan(horse, FeedingPlanStatus.DRAFT, trainerId),
        archived: await plan(horse, FeedingPlanStatus.ARCHIVED, trainerId),
      },
    };
  };

  const changeTo = (horse: string, lifecycleStatus: HorseLifecycleStatus) =>
    statuses.updateLifecycle(cm, horse, { lifecycleStatus, reason: 'Lý do' });

  const plansOf = async (horse: string) =>
    Object.fromEntries(
      (
        await dataSource.query<
          {
            id: string;
            status: string;
            archived_at: Date | null;
            items: number;
          }[]
        >(
          `SELECT p.id, p.status, p.archived_at,
                  (SELECT COUNT(*)::int FROM feeding_plan_items i WHERE i.plan_id = p.id) AS items
             FROM feeding_plans p WHERE p.horse_id = $1`,
          [horse],
        )
      ).map((row) => [row.id, row]),
    );

  const tasksOf = async (horse: string) =>
    Object.fromEntries(
      (
        await dataSource.query<TaskRow[]>(
          `SELECT id, from_date::text, to_date::text FROM horse_daily_tasks WHERE horse_id = $1`,
          [horse],
        )
      ).map((row) => [row.id, row]),
    );

  const checklistOf = async (horse: string) => {
    const [row] = await dataSource.query<{ id: string; status: string }[]>(
      'SELECT id, status FROM daily_checklists WHERE horse_id = $1',
      [horse],
    );
    return row;
  };

  const lifecycleAudit = async (horse: string) => {
    const [row] = await dataSource.query<
      { after_data: Record<string, unknown> }[]
    >(
      `SELECT after_data FROM audit_logs
        WHERE entity_id = $1 AND feature = 'HORSE_LIFECYCLE'
        ORDER BY created_at DESC LIMIT 1`,
      [horse],
    );
    return row.after_data;
  };

  beforeAll(async () => {
    db = await startTestPostgres();
    dataSource = db.dataSource;
    seed = fixtures(dataSource);
    moduleRef = await Test.createTestingModule({
      imports: [
        EventEmitterModule.forRoot(),
        ScheduleModule.forRoot(),
        TypeOrmModule.forRootAsync({
          useFactory: () => ({ type: 'postgres' }),
          dataSourceFactory: () => Promise.resolve(dataSource),
        }),
        DomainEventsModule,
        HorseStatusesModule,
        DailyChecklistsModule,
      ],
    }).compile();
    statuses = moduleRef.get(HorseStatusesService);
    checklists = moduleRef.get(ChecklistsService);
  });

  afterAll(async () => {
    await moduleRef?.close();
    await db?.container.stop();
  });

  beforeEach(async () => {
    await truncateAllTables(dataSource);
    today = clubToday();
    const cmId = await seed.user(UserRole.CLUB_MANAGER);
    cm = await actorOf(cmId, UserRole.CLUB_MANAGER);
  });

  describe.each([
    HorseLifecycleStatus.TRANSFERRED,
    HorseLifecycleStatus.DECEASED,
  ])('to %s', (to) => {
    it('previews the stable care it will settle', async () => {
      const { horse } = await stableHorse();

      const shown = await statuses.previewLifecycle(cm, horse, {
        lifecycleStatus: to,
      });

      expect(shown).toMatchObject({
        feedingPlansArchived: 1,
        draftFeedingPlansDeleted: 1,
        careTasksEnded: 2,
        careTasksDeleted: 2,
        checklistCancelled: true,
      });
      expect(shown.summary).toContain('hủy checklist hôm nay');
    });

    it('archives the active plan, deletes the draft with its items and keeps the archived one', async () => {
      const { horse, plans } = await stableHorse();

      await changeTo(horse, to);

      const rows = await plansOf(horse);
      expect(rows[plans.active].status).toBe(FeedingPlanStatus.ARCHIVED);
      expect(rows[plans.active].archived_at).toBeInstanceOf(Date);
      expect(rows[plans.draft]).toBeUndefined();
      expect(rows[plans.archived]).toMatchObject({
        status: FeedingPlanStatus.ARCHIVED,
        archived_at: null,
      });
      const [orphans] = await dataSource.query<{ n: number }[]>(
        `SELECT COUNT(*)::int AS n FROM feeding_plan_items i
          WHERE NOT EXISTS (SELECT 1 FROM feeding_plans p WHERE p.id = i.plan_id)`,
      );
      expect(orphans.n).toBe(0);
    });

    it('ends running care tasks today, deletes future ones and keeps ended ones', async () => {
      const { horse, tasks } = await stableHorse();
      const before = await tasksOf(horse);

      await changeTo(horse, to);

      const rows = await tasksOf(horse);
      expect(rows[tasks.running].to_date).toBe(today);
      expect(rows[tasks.runningExempt].to_date).toBe(today);
      expect(rows[tasks.endsToday]).toEqual(before[tasks.endsToday]);
      expect(rows[tasks.ended]).toEqual(before[tasks.ended]);
      expect(rows[tasks.future]).toBeUndefined();
      expect(rows[tasks.futureExempt]).toBeUndefined();
    });

    it('cancels today’s checklist, keeps the ticked item and rejects ticking with 409', async () => {
      const { horse, groom, ticked, unticked } = await stableHorse();

      await changeTo(horse, to);

      expect((await checklistOf(horse)).status).toBe(
        DailyChecklistStatus.CANCELLED,
      );
      const [kept] = await dataSource.query<{ done_at: Date | null }[]>(
        'SELECT done_at FROM daily_checklist_items WHERE id = $1',
        [ticked],
      );
      expect(kept.done_at).toBeInstanceOf(Date);
      await expect(
        checklists.tick(groom, unticked, { done: true }),
      ).rejects.toThrow(
        new ConflictException(
          'Checklist đã hủy vì ngựa đã chuyển nhượng hoặc đã mất, không sửa được',
        ),
      );
    });

    it('keeps the cancelled checklist out of the next day’s INCOMPLETE run', async () => {
      const { horse } = await stableHorse();
      await changeTo(horse, to);

      await checklists.closePastDays(shiftDays(today, 1));

      expect((await checklistOf(horse)).status).toBe(
        DailyChecklistStatus.CANCELLED,
      );
    });

    it('audits what was settled', async () => {
      const { horse } = await stableHorse();

      await changeTo(horse, to);

      expect(await lifecycleAudit(horse)).toMatchObject({
        feedingPlansArchived: 1,
        draftFeedingPlansDeleted: 1,
        careTasksEnded: 2,
        careTasksDeleted: 2,
        checklistCancelled: true,
      });
    });
  });

  it('leaves no stable care audit key when the horse had nothing to settle', async () => {
    const horse = await seed.horse('Mây');

    await changeTo(horse, HorseLifecycleStatus.TRANSFERRED);

    const after = await lifecycleAudit(horse);
    for (const key of [
      'feedingPlansArchived',
      'draftFeedingPlansDeleted',
      'careTasksEnded',
      'careTasksDeleted',
      'checklistCancelled',
    ]) {
      expect(after).not.toHaveProperty(key);
    }
  });

  it('touches no stable care when the horse retires', async () => {
    const { horse, groom, unticked } = await stableHorse();
    const plansBefore = await plansOf(horse);
    const tasksBefore = await tasksOf(horse);

    const shown = await statuses.previewLifecycle(cm, horse, {
      lifecycleStatus: HorseLifecycleStatus.RETIRED,
    });
    await changeTo(horse, HorseLifecycleStatus.RETIRED);

    expect(shown).toMatchObject({
      feedingPlansArchived: 0,
      draftFeedingPlansDeleted: 0,
      careTasksEnded: 0,
      careTasksDeleted: 0,
      checklistCancelled: false,
    });
    expect(await plansOf(horse)).toEqual(plansBefore);
    expect(await tasksOf(horse)).toEqual(tasksBefore);
    expect((await checklistOf(horse)).status).toBe(
      DailyChecklistStatus.IN_PROGRESS,
    );
    await expect(
      checklists.tick(groom, unticked, { done: true }),
    ).resolves.toBeDefined();
  });
});

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { UserRole } from '../../src/common/enums/role.enum';
import { DomainEventPublisher } from '../../src/common/infrastructure/events/domain-event.publisher';
import type { Actor } from '../../src/common/types/actor';
import { clubToday, shiftDays } from '../../src/common/utils/club-date';
import { HorseAccessService } from '../../src/modules/horses/shared/horse-access.service';
import { CareTasksService } from '../../src/modules/stable/care-tasks/care-tasks.service';
import { DailyChecklistStatus } from '../../src/modules/stable/constants/daily-checklist-status.enum';
import { CHECKLIST_TASK_ADDED_EVENT } from '../../src/modules/stable/constants/stable-events.constants';
import { ChecklistsService } from '../../src/modules/stable/daily-checklists/checklists.service';
import { CareTaskTypeEntity } from '../../src/modules/stable/entities/care-task-type.entity';
import { DailyChecklistEntity } from '../../src/modules/stable/entities/daily-checklist.entity';
import { HorseCareTaskEntity } from '../../src/modules/stable/entities/horse-care-task.entity';
import { DailyChecklistsService } from '../../src/modules/stable/shared/daily-checklists.service';
import { StableAccessService } from '../../src/modules/stable/shared/stable-access.service';
import { fixtures } from './fixtures';
import {
  startTestPostgres,
  stopTestPostgres,
  truncateAllTables,
  type TestPostgres,
} from './postgres';

const DEFAULT_TYPES = [
  { name: 'Cho ăn', appliesToAll: true },
  { name: 'Vệ sinh chuồng', appliesToAll: true },
  { name: 'Tắm rửa', appliesToAll: true },
  { name: 'Ngâm chân nước đá', appliesToAll: false },
];

describe('Daily checklists and care tasks (Postgres)', () => {
  let db: TestPostgres;
  let dataSource: DataSource;
  let seed: ReturnType<typeof fixtures>;
  let checklists: ChecklistsService;
  let careTasks: CareTasksService;
  let daily: DailyChecklistsService;
  let manager: Actor;
  let trainer: Actor;
  let otherTrainer: Actor;
  let groom: Actor;
  let otherGroom: Actor;
  let groomId: string;
  let otherGroomId: string;
  let gio: string;
  let may: string;
  let types: Record<string, string>;
  let today: string;

  const actorOf = async (id: string, role: UserRole): Promise<Actor> => {
    const [row] = await dataSource.query<{ keycloak_id: string }[]>(
      'SELECT keycloak_id FROM users WHERE id = $1',
      [id],
    );
    return { sub: row.keycloak_id, roles: [role] };
  };

  const assignGroom = (horseId: string, id: string) =>
    dataSource.query(
      `INSERT INTO groom_assignments (version, horse_id, groom_id, start_at)
       VALUES (1, $1, $2, now())`,
      [horseId, id],
    );

  const todayOf = async (actor: Actor, horseId: string) =>
    (await checklists.listForHorse(actor, horseId, {}))[0];

  beforeAll(async () => {
    db = await startTestPostgres();
    dataSource = db.dataSource;
    seed = fixtures(dataSource);
    const access = new StableAccessService(new HorseAccessService(dataSource));
    daily = new DailyChecklistsService(new DomainEventPublisher());
    checklists = new ChecklistsService(
      dataSource.getRepository(DailyChecklistEntity),
      access,
      daily,
      dataSource,
    );
    careTasks = new CareTasksService(
      dataSource.getRepository(CareTaskTypeEntity),
      dataSource.getRepository(HorseCareTaskEntity),
      access,
      daily,
      dataSource,
    );
  });

  afterAll(() => stopTestPostgres(db));

  beforeEach(async () => {
    await truncateAllTables(dataSource);
    today = clubToday();
    manager = await actorOf(
      await seed.user(UserRole.CLUB_MANAGER),
      UserRole.CLUB_MANAGER,
    );
    const trainerId = await seed.user(UserRole.HEAD_TRAINER);
    const otherTrainerId = await seed.user(UserRole.HEAD_TRAINER);
    groomId = await seed.user(UserRole.GROOM);
    otherGroomId = await seed.user(UserRole.GROOM);
    trainer = await actorOf(trainerId, UserRole.HEAD_TRAINER);
    otherTrainer = await actorOf(otherTrainerId, UserRole.HEAD_TRAINER);
    groom = await actorOf(groomId, UserRole.GROOM);
    otherGroom = await actorOf(otherGroomId, UserRole.GROOM);
    const barn = await seed.barn('Khu A');
    await dataSource.query(
      'UPDATE barns SET head_trainer_id = $1 WHERE id = $2',
      [trainerId, barn],
    );
    const otherBarn = await seed.barn('Khu B');
    await dataSource.query(
      'UPDATE barns SET head_trainer_id = $1 WHERE id = $2',
      [otherTrainerId, otherBarn],
    );
    gio = await seed.horse('Gió', { barnId: barn });
    may = await seed.horse('Mây', { barnId: barn });
    await assignGroom(gio, groomId);
    types = {};
    for (const type of DEFAULT_TYPES) {
      types[type.name] = (await careTasks.createType(manager, type)).id;
    }
  });

  describe('generating on read', () => {
    it('builds today from the types that apply to every horse', async () => {
      const checklist = await todayOf(groom, gio);

      expect(checklist).toMatchObject({
        checklistDate: today,
        status: DailyChecklistStatus.PENDING,
        horseName: 'Gió',
      });
      expect(checklist.groom.id).toBe(groomId);
      expect(checklist.items.map((item) => item.name)).toEqual([
        'Cho ăn',
        'Vệ sinh chuồng',
        'Tắm rửa',
      ]);
    });

    it('adds a horse task that is running today', async () => {
      await careTasks.createForHorse(trainer, gio, {
        taskTypeId: types['Ngâm chân nước đá'],
        fromDate: today,
        toDate: shiftDays(today, 13),
      });

      const checklist = await todayOf(trainer, gio);

      expect(checklist.items.map((item) => item.name)).toContain(
        'Ngâm chân nước đá',
      );
    });

    it('leaves out a type that was switched off', async () => {
      await careTasks.updateType(manager, types['Tắm rửa'], { active: false });

      const checklist = await todayOf(groom, gio);

      expect(checklist.items.map((item) => item.name)).not.toContain('Tắm rửa');
    });

    it('creates nothing for a horse without a groom', async () => {
      expect(await checklists.listForHorse(trainer, may, {})).toEqual([]);
    });

    it('returns the first checklist when a second read races it', async () => {
      const first = dataSource.createQueryRunner();
      await first.connect();
      await first.startTransaction();
      const firstId = await daily.ensureChecklist(first.manager, gio, today);
      const second = dataSource.transaction((tx) =>
        daily.ensureChecklist(tx, gio, today),
      );
      await new Promise((resolve) => setTimeout(resolve, 300));
      await first.commitTransaction();
      await first.release();

      expect(await second).toBe(firstId);
      const [row] = await dataSource.query<{ lists: number; items: number }[]>(
        `SELECT (SELECT COUNT(*) FROM daily_checklists)::int AS lists,
                (SELECT COUNT(*) FROM daily_checklist_items)::int AS items`,
      );
      expect(row).toEqual({ lists: 1, items: 3 });
    });

    it('hides the checklist from a groom who does not care for the horse', async () => {
      await expect(
        checklists.listForHorse(otherGroom, gio, {}),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('ticking', () => {
    it('moves through pending, in progress and completed', async () => {
      const checklist = await todayOf(groom, gio);
      const [feed, clean, bath] = checklist.items;

      const partly = await checklists.tick(groom, feed.id, {
        done: true,
        note: 'Ăn hết',
      });
      expect(partly.status).toBe(DailyChecklistStatus.IN_PROGRESS);
      expect(partly.items[0]).toMatchObject({ done: true, note: 'Ăn hết' });

      await checklists.tick(groom, clean.id, { done: true });
      const done = await checklists.tick(groom, bath.id, { done: true });
      expect(done.status).toBe(DailyChecklistStatus.COMPLETED);
      expect(done.completedAt).not.toBeNull();

      const undone = await checklists.tick(groom, bath.id, { done: false });
      expect(undone.status).toBe(DailyChecklistStatus.IN_PROGRESS);
      expect(undone.completedAt).toBeNull();
      expect(undone.items[2].doer).toBeNull();
    });

    it('lets only the checklist groom tick', async () => {
      const checklist = await todayOf(groom, gio);
      await expect(
        checklists.tick(otherGroom, checklist.items[0].id, { done: true }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('refuses to tick a past day', async () => {
      const checklist = await todayOf(groom, gio);
      await dataSource.query(
        'UPDATE daily_checklists SET checklist_date = $1 WHERE id = $2',
        [shiftDays(today, -1), checklist.id],
      );

      await expect(
        checklists.tick(groom, checklist.items[0].id, { done: true }),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('closing past days', () => {
    it('marks open past checklists incomplete and leaves the rest', async () => {
      const open = await todayOf(groom, gio);
      await assignGroom(may, groomId);
      const finished = await todayOf(groom, may);
      for (const item of finished.items) {
        await checklists.tick(groom, item.id, { done: true });
      }
      await dataSource.query(
        'UPDATE daily_checklists SET checklist_date = $1',
        [shiftDays(today, -1)],
      );

      expect(await checklists.closePastDays(today)).toBe(1);
      expect(await checklists.closePastDays(today)).toBe(0);

      const rows = await dataSource.query<{ id: string; status: string }[]>(
        'SELECT id, status FROM daily_checklists',
      );
      const byId = Object.fromEntries(rows.map((row) => [row.id, row.status]));
      expect(byId[open.id]).toBe(DailyChecklistStatus.INCOMPLETE);
      expect(byId[finished.id]).toBe(DailyChecklistStatus.COMPLETED);
    });

    it('does not close today', async () => {
      await todayOf(groom, gio);
      expect(await checklists.closePastDays(today)).toBe(0);
    });
  });

  describe('horse care tasks', () => {
    it('reopens a completed checklist and notifies the groom', async () => {
      const checklist = await todayOf(groom, gio);
      for (const item of checklist.items) {
        await checklists.tick(groom, item.id, { done: true });
      }

      await careTasks.createForHorse(trainer, gio, {
        taskTypeId: types['Ngâm chân nước đá'],
        fromDate: today,
        toDate: today,
        note: 'Sau buổi chạy nặng',
      });

      const reopened = await todayOf(groom, gio);
      expect(reopened.status).toBe(DailyChecklistStatus.IN_PROGRESS);
      expect(reopened.items.at(-1)?.name).toBe('Ngâm chân nước đá');
      const events = await dataSource.query<
        { payload: { groomId: string; taskName: string } }[]
      >('SELECT payload FROM outbox_events WHERE event_name = $1', [
        CHECKLIST_TASK_ADDED_EVENT,
      ]);
      expect(events.map((event) => event.payload)).toEqual([
        expect.objectContaining({
          groomId,
          taskName: 'Ngâm chân nước đá',
        }),
      ]);
    });

    it('does not touch today when the task starts later', async () => {
      await todayOf(groom, gio);
      await careTasks.createForHorse(trainer, gio, {
        taskTypeId: types['Ngâm chân nước đá'],
        fromDate: shiftDays(today, 1),
        toDate: shiftDays(today, 3),
      });

      expect((await todayOf(groom, gio)).items).toHaveLength(3);
      expect(await dataSource.query('SELECT id FROM outbox_events')).toEqual(
        [],
      );
    });

    it('rejects an overlapping assignment of the same type', async () => {
      await careTasks.createForHorse(trainer, gio, {
        taskTypeId: types['Ngâm chân nước đá'],
        fromDate: today,
        toDate: shiftDays(today, 5),
      });

      await expect(
        careTasks.createForHorse(trainer, gio, {
          taskTypeId: types['Ngâm chân nước đá'],
          fromDate: shiftDays(today, 5),
          toDate: shiftDays(today, 7),
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('rejects a type that already applies to every horse', async () => {
      await expect(
        careTasks.createForHorse(trainer, gio, {
          taskTypeId: types['Cho ăn'],
          fromDate: today,
          toDate: today,
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('rejects a start date in the past', async () => {
      await expect(
        careTasks.createForHorse(trainer, gio, {
          taskTypeId: types['Ngâm chân nước đá'],
          fromDate: shiftDays(today, -1),
          toDate: today,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects a trainer outside the barn', async () => {
      await expect(
        careTasks.createForHorse(otherTrainer, gio, {
          taskTypeId: types['Ngâm chân nước đá'],
          fromDate: today,
          toDate: today,
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('deletes a future task and ends a running one today', async () => {
      const future = await careTasks.createForHorse(trainer, gio, {
        taskTypeId: types['Ngâm chân nước đá'],
        fromDate: shiftDays(today, 2),
        toDate: shiftDays(today, 4),
      });
      const running = await careTasks.createForHorse(trainer, may, {
        taskTypeId: types['Ngâm chân nước đá'],
        fromDate: today,
        toDate: shiftDays(today, 4),
      });

      await careTasks.removeForHorse(trainer, future.id);
      await careTasks.removeForHorse(trainer, running.id);

      expect(await careTasks.listForHorse(trainer, gio)).toEqual([]);
      const [ended] = await careTasks.listForHorse(trainer, may);
      expect(ended.toDate).toBe(today);
    });

    it('refuses to remove a task that already ended', async () => {
      const task = await careTasks.createForHorse(trainer, gio, {
        taskTypeId: types['Ngâm chân nước đá'],
        fromDate: today,
        toDate: today,
      });
      await dataSource.query(
        'UPDATE horse_care_tasks SET from_date = $1, to_date = $1 WHERE id = $2',
        [shiftDays(today, -2), task.id],
      );

      await expect(
        careTasks.removeForHorse(trainer, task.id),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  it('includes a task attached while today is being generated', async () => {
    const attach = dataSource.createQueryRunner();
    await attach.connect();
    await attach.startTransaction();
    await attach.query('SELECT id FROM horses WHERE id = $1 FOR UPDATE', [gio]);
    const creatorId = await seed.user(UserRole.HEAD_TRAINER);
    await attach.query(
      `INSERT INTO horse_care_tasks (horse_id, task_type_id, from_date, to_date, created_by)
       VALUES ($1, $2, $3, $3, $4)`,
      [gio, types['Ngâm chân nước đá'], today, creatorId],
    );
    const generated = dataSource.transaction((tx) =>
      daily.ensureChecklist(tx, gio, today),
    );
    await new Promise((resolve) => setTimeout(resolve, 300));
    await attach.commitTransaction();
    await attach.release();
    await generated;

    expect(
      (await todayOf(groom, gio)).items.map((item) => item.name),
    ).toContain('Ngâm chân nước đá');
  });

  describe('missing records and duplicate names', () => {
    const missing = '00000000-0000-4000-8000-000000000000';

    it('returns 404 for a missing checklist item, type or horse task', async () => {
      await expect(
        checklists.tick(groom, missing, { done: true }),
      ).rejects.toBeInstanceOf(NotFoundException);
      await expect(
        careTasks.updateType(manager, missing, { active: false }),
      ).rejects.toBeInstanceOf(NotFoundException);
      await expect(
        careTasks.createForHorse(trainer, gio, {
          taskTypeId: missing,
          fromDate: today,
          toDate: today,
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
      await expect(
        careTasks.removeForHorse(trainer, missing),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects a duplicate type name with 409', async () => {
      await expect(
        careTasks.createType(manager, { name: 'Cho ăn', appliesToAll: true }),
      ).rejects.toBeInstanceOf(ConflictException);
      await expect(
        careTasks.updateType(manager, types['Tắm rửa'], { name: 'Cho ăn' }),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  it('moves today’s open checklist to the new groom on reassignment', async () => {
    const checklist = await todayOf(groom, gio);

    await dataSource.transaction((tx) =>
      daily.moveOpenChecklistsToGroom(tx, gio, groomId, otherGroomId, today),
    );
    await dataSource.query(
      'UPDATE groom_assignments SET end_at = now() WHERE horse_id = $1',
      [gio],
    );
    await assignGroom(gio, otherGroomId);

    const moved = await todayOf(otherGroom, gio);
    expect(moved.id).toBe(checklist.id);
    expect(moved.groom.id).toBe(otherGroomId);
    await expect(
      checklists.tick(groom, moved.items[0].id, { done: true }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});

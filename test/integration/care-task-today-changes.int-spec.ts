import { ConflictException, ForbiddenException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { UserRole } from '../../src/common/enums/role.enum';
import { UserStatus } from '../../src/common/enums/user-status.enum';
import { DomainEventPublisher } from '../../src/common/infrastructure/events/domain-event.publisher';
import type { Actor } from '../../src/common/types/actor';
import { clubToday, shiftDays } from '../../src/common/utils/club-date';
import { AuditService } from '../../src/modules/audit/services/audit.service';
import { HorseAccessService } from '../../src/modules/horses/shared/horse-access.service';
import { CareTasksService } from '../../src/modules/stable/care-tasks/care-tasks.service';
import { HorseCareTaskMode } from '../../src/modules/stable/constants/horse-care-task-mode.enum';
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

describe('Removing a horse task or switching off a task type changes today’s checklist (Postgres)', () => {
  let db: TestPostgres;
  let dataSource: DataSource;
  let seed: ReturnType<typeof fixtures>;
  let checklists: ChecklistsService;
  let careTasks: CareTasksService;
  let manager: Actor;
  let trainer: Actor;
  let groom: Actor;
  let gio: string;
  let may: string;
  let today: string;
  let types: Record<string, string>;

  const actorOf = async (id: string, role: UserRole): Promise<Actor> => {
    const [row] = await dataSource.query<{ keycloak_id: string }[]>(
      'SELECT keycloak_id FROM users WHERE id = $1',
      [id],
    );
    return { sub: row.keycloak_id, roles: [role] };
  };

  beforeAll(async () => {
    db = await startTestPostgres();
    dataSource = db.dataSource;
    seed = fixtures(dataSource);
    const access = new StableAccessService(new HorseAccessService(dataSource));
    const daily = new DailyChecklistsService(new DomainEventPublisher());
    checklists = new ChecklistsService(
      dataSource.getRepository(DailyChecklistEntity),
      access,
      daily,
      dataSource,
      new AuditService(),
    );
    careTasks = new CareTasksService(
      dataSource.getRepository(CareTaskTypeEntity),
      dataSource.getRepository(HorseCareTaskEntity),
      access,
      daily,
      dataSource,
      new AuditService(),
      new DomainEventPublisher(),
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
    const groomId = await seed.user(UserRole.GROOM);
    trainer = await actorOf(trainerId, UserRole.HEAD_TRAINER);
    groom = await actorOf(groomId, UserRole.GROOM);
    const barn = await seed.barn('Khu A');
    await dataSource.query(
      'UPDATE barns SET head_trainer_id = $1 WHERE id = $2',
      [trainerId, barn],
    );
    gio = await seed.horse('Gió', { barnId: barn });
    may = await seed.horse('Mây', { barnId: barn });
    for (const horse of [gio, may]) {
      await dataSource.query(
        `INSERT INTO groom_assignments (version, horse_id, groom_id, start_at)
         VALUES (1, $1, $2, now())`,
        [horse, groomId],
      );
    }
    types = {};
    for (const [name, appliesToAll] of [
      ['Cho ăn sáng', true],
      ['Tắm rửa', true],
      ['Ngâm chân nước đá', false],
    ] as const) {
      types[name] = (
        await careTasks.createType(manager, { name, appliesToAll })
      ).id;
    }
  });

  it('rejects an inactive account with 403 when listing task types', async () => {
    const locked = await actorOf(
      await seed.user(UserRole.GROOM, UserStatus.INACTIVE),
      UserRole.GROOM,
    );

    await expect(careTasks.listTypes(locked)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  const checklistOf = async (horseId: string, date = today) => {
    const [checklist] = await checklists.listForHorse(trainer, horseId, {
      from: date,
      to: date,
    });
    return checklist;
  };

  const tasksOf = async (horseId: string, date = today) =>
    (await checklistOf(horseId, date))?.items.map((item) => item.name);

  const tick = async (horseId: string, name: string) => {
    const checklist = await checklistOf(horseId);
    const item = checklist.items.find((row) => row.name === name);
    await checklists.tick(groom, item!.id, { done: true });
  };

  const attachIce = (fromDate = today, toDate = shiftDays(today, 3)) =>
    careTasks.createForHorse(trainer, gio, {
      taskTypeId: types['Ngâm chân nước đá'],
      fromDate,
      toDate,
    });

  describe('removing an extra task that is running today', () => {
    it('ends an older task today and drops its unticked line from today', async () => {
      const task = await attachIce();
      await dataSource.query(
        'UPDATE horse_daily_tasks SET from_date = $1 WHERE id = $2',
        [shiftDays(today, -2), task.id],
      );
      expect(await tasksOf(gio)).toContain('Ngâm chân nước đá');

      await careTasks.removeForHorse(trainer, task.id);

      expect(await tasksOf(gio)).toEqual(['Cho ăn sáng', 'Tắm rửa']);
      await expect(careTasks.listForHorse(trainer, gio)).resolves.toEqual([
        expect.objectContaining({ toDate: today }) as unknown,
      ]);
    });

    it('keeps the line when the groom already ticked it, and leaves other days alone', async () => {
      await checklists.generateDay(shiftDays(today, -1));
      const task = await attachIce();
      await dataSource.query(
        'UPDATE horse_daily_tasks SET from_date = $1 WHERE id = $2',
        [shiftDays(today, -1), task.id],
      );
      await dataSource.query(
        `INSERT INTO daily_checklist_items (checklist_id, task_type_id, position)
         SELECT id, $1, 9 FROM daily_checklists WHERE horse_id = $2 AND checklist_date = $3`,
        [types['Ngâm chân nước đá'], gio, shiftDays(today, -1)],
      );
      await tick(gio, 'Ngâm chân nước đá');

      await careTasks.removeForHorse(trainer, task.id);

      expect(await tasksOf(gio)).toContain('Ngâm chân nước đá');
      expect(await tasksOf(gio, shiftDays(today, -1))).toContain(
        'Ngâm chân nước đá',
      );
    });

    it('deletes a task that started today, so it can be attached again the same day', async () => {
      const task = await attachIce();

      await careTasks.removeForHorse(trainer, task.id);

      await expect(careTasks.listForHorse(trainer, gio)).resolves.toEqual([]);
      expect(await tasksOf(gio)).toEqual(['Cho ăn sáng', 'Tắm rửa']);

      await expect(attachIce()).resolves.toMatchObject({ fromDate: today });
      expect(await tasksOf(gio)).toEqual([
        'Cho ăn sáng',
        'Tắm rửa',
        'Ngâm chân nước đá',
      ]);
    });

    it('keeps today’s checklist as done when the removed task was the only thing to do, and adds a later task to it', async () => {
      await careTasks.updateType(manager, types['Cho ăn sáng'], {
        active: false,
      });
      await careTasks.updateType(manager, types['Tắm rửa'], { active: false });
      const task = await attachIce();
      const before = await checklistOf(gio);
      expect(before.items.map((item) => item.name)).toEqual([
        'Ngâm chân nước đá',
      ]);

      await careTasks.removeForHorse(trainer, task.id);

      const emptied = await checklistOf(gio);
      expect(emptied).toMatchObject({
        id: before.id,
        status: 'COMPLETED',
        items: [],
      });
      expect(emptied.completedAt).not.toBeNull();

      const wrap = await careTasks.createType(manager, {
        name: 'Băng chân',
        appliesToAll: false,
      });
      await careTasks.createForHorse(trainer, gio, {
        taskTypeId: wrap.id,
        fromDate: today,
        toDate: today,
      });

      await expect(checklistOf(gio)).resolves.toMatchObject({
        id: before.id,
        status: 'PENDING',
        completedAt: null,
        items: [expect.objectContaining({ name: 'Băng chân' })],
      });
    });
  });

  describe('switching off a task type', () => {
    it('drops its unticked line from today’s checklist of every horse and recomputes the status', async () => {
      await checklists.generateDay(today);
      await tick(gio, 'Cho ăn sáng');

      await careTasks.updateType(manager, types['Tắm rửa'], { active: false });

      expect(await tasksOf(gio)).toEqual(['Cho ăn sáng']);
      expect((await checklistOf(gio)).status).toBe('COMPLETED');
      expect(await tasksOf(may)).toEqual(['Cho ăn sáng']);
      expect((await checklistOf(may)).status).toBe('PENDING');
    });

    it('keeps a ticked line, other days, and a checklist left empty as done', async () => {
      await checklists.generateDay(shiftDays(today, -1));
      await checklists.generateDay(today);
      await tick(gio, 'Tắm rửa');
      await careTasks.updateType(manager, types['Cho ăn sáng'], {
        active: false,
      });

      await careTasks.updateType(manager, types['Tắm rửa'], { active: false });

      expect(await tasksOf(gio)).toEqual(['Tắm rửa']);
      await expect(checklistOf(may)).resolves.toMatchObject({
        status: 'COMPLETED',
        items: [],
      });
      expect(await tasksOf(may, shiftDays(today, -1))).toEqual([
        'Cho ăn sáng',
        'Tắm rửa',
      ]);
    });

    it('changes nothing when the type stays on', async () => {
      await checklists.generateDay(today);

      await careTasks.updateType(manager, types['Tắm rửa'], { active: true });

      expect(await tasksOf(may)).toEqual(['Cho ăn sáng', 'Tắm rửa']);
    });
  });

  describe('renaming a task type', () => {
    const usedMessage = 'Loại việc đã dùng trong checklist, không đổi tên được';

    it('refuses to rename a type that is already on a checklist', async () => {
      await checklists.generateDay(shiftDays(today, -1));

      const error = await careTasks
        .updateType(manager, types['Tắm rửa'], { name: 'Chải lông' })
        .catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(ConflictException);
      expect((error as ConflictException).getResponse()).toMatchObject({
        message: usedMessage,
        errors: [{ field: 'name', message: usedMessage }],
      });
      expect(await tasksOf(gio, shiftDays(today, -1))).toContain('Tắm rửa');
    });

    it('accepts the same name with spaces, and renames a type never used', async () => {
      await checklists.generateDay(today);

      await expect(
        careTasks.updateType(manager, types['Tắm rửa'], {
          name: '  Tắm rửa ',
          active: true,
        }),
      ).resolves.toMatchObject({ name: 'Tắm rửa' });
      await expect(
        careTasks.updateType(manager, types['Ngâm chân nước đá'], {
          name: 'Chườm đá',
        }),
      ).resolves.toMatchObject({ name: 'Chườm đá' });
    });

    it('reports the open horse tasks before the rename when both are blocked', async () => {
      await checklists.generateDay(today);
      await careTasks.createForHorse(trainer, gio, {
        taskTypeId: types['Tắm rửa'],
        mode: HorseCareTaskMode.EXEMPT,
        fromDate: shiftDays(today, 1),
        toDate: shiftDays(today, 2),
        note: 'Ngựa sốt',
      });

      await expect(
        careTasks.updateType(manager, types['Tắm rửa'], {
          name: 'Chải lông',
          appliesToAll: false,
        }),
      ).rejects.toThrow(
        'Loại việc còn ngựa được gắn thêm hoặc được miễn chưa hết hạn, gỡ các dòng đó trước khi đổi cờ áp mọi ngựa',
      );
    });
  });
});

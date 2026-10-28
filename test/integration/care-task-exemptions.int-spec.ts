import { BadRequestException, ConflictException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { UserRole } from '../../src/common/enums/role.enum';
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

describe('Exempting a horse from a shared care task (Postgres)', () => {
  let db: TestPostgres;
  let dataSource: DataSource;
  let seed: ReturnType<typeof fixtures>;
  let checklists: ChecklistsService;
  let careTasks: CareTasksService;
  let manager: Actor;
  let trainer: Actor;
  let groom: Actor;
  let gio: string;
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
    await dataSource.query(
      `INSERT INTO groom_assignments (version, horse_id, groom_id, start_at)
       VALUES (1, $1, $2, now())`,
      [gio, groomId],
    );
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

  const exempt = (name: string, fromDate = today, toDate = today) =>
    careTasks.createForHorse(trainer, gio, {
      taskTypeId: types[name],
      mode: HorseCareTaskMode.EXEMPT,
      fromDate,
      toDate,
      note: 'Ngựa đang sốt, bác sĩ dặn không tắm',
    });

  const tasksOn = async (date: string) => {
    const [checklist] = await checklists.listForHorse(trainer, gio, {
      from: date,
      to: date,
    });
    return checklist?.items.map((item) => item.name);
  };

  it('leaves the exempted shared task out while the exemption runs, and brings it back after', async () => {
    const tomorrow = shiftDays(today, 1);
    await exempt('Tắm rửa', tomorrow, tomorrow);

    await checklists.generateDay(tomorrow);
    await checklists.generateDay(shiftDays(today, 2));

    expect(await tasksOn(tomorrow)).toEqual(['Cho ăn sáng']);
    expect(await tasksOn(shiftDays(today, 2))).toEqual([
      'Cho ăn sáng',
      'Tắm rửa',
    ]);
  });

  it('removes an unticked task from the checklist of today but keeps a ticked one', async () => {
    await checklists.generateDay(today);
    const [checklist] = await checklists.listForHorse(groom, gio, {});
    const bath = checklist.items.find((item) => item.name === 'Tắm rửa');
    await checklists.tick(groom, bath!.id, { done: true });

    await exempt('Tắm rửa');
    await exempt('Cho ăn sáng');

    const [after] = await checklists.listForHorse(groom, gio, {});
    expect(after.items.map((item) => [item.name, item.done])).toEqual([
      ['Tắm rửa', true],
    ]);
    expect(after.status).toBe('COMPLETED');
  });

  it('does not create the checklist of today nor tell the groom about a task when only exempting', async () => {
    await exempt('Tắm rửa');

    expect(await tasksOn(today)).toBeUndefined();
    await expect(
      dataSource.query(
        `SELECT count(*)::int AS count FROM outbox_events WHERE event_name = 'stable.checklist.task-added'`,
      ),
    ).resolves.toEqual([{ count: 0 }]);
    await checklists.generateDay(today);
    expect(await tasksOn(today)).toEqual(['Cho ăn sáng']);
  });

  it('keeps the checklist of today as done when the exemption leaves nothing to do', async () => {
    await checklists.generateDay(today);

    await exempt('Tắm rửa');
    await exempt('Cho ăn sáng');

    expect(await tasksOn(today)).toEqual([]);
    const [checklist] = await checklists.listForHorse(trainer, gio, {
      from: today,
      to: today,
    });
    expect(checklist.status).toBe('COMPLETED');
  });

  it('brings the shared task back into today when the exemption is removed', async () => {
    await checklists.generateDay(today);
    const exemption = await exempt('Tắm rửa');
    expect(await tasksOn(today)).toEqual(['Cho ăn sáng']);

    await careTasks.removeForHorse(trainer, exemption.id);

    expect(await tasksOn(today)).toEqual(['Cho ăn sáng', 'Tắm rửa']);
    await expect(careTasks.listForHorse(trainer, gio)).resolves.toEqual([]);
  });

  it('ends an older exemption yesterday so the task is back from today', async () => {
    const exemption = await exempt('Tắm rửa');
    await dataSource.query(
      `UPDATE horse_daily_tasks SET from_date = $1, to_date = $2 WHERE id = $3`,
      [shiftDays(today, -3), shiftDays(today, 5), exemption.id],
    );

    await careTasks.removeForHorse(trainer, exemption.id);

    expect(await tasksOn(today)).toEqual(['Cho ăn sáng', 'Tắm rửa']);
    await expect(careTasks.listForHorse(trainer, gio)).resolves.toEqual([
      expect.objectContaining({
        mode: HorseCareTaskMode.EXEMPT,
        toDate: shiftDays(today, -1),
      }) as unknown,
    ]);
  });

  it('still adds an extra task to the checklist of today, and lists both kinds with their mode', async () => {
    await checklists.generateDay(today);
    await exempt('Tắm rửa');

    await careTasks.createForHorse(trainer, gio, {
      taskTypeId: types['Ngâm chân nước đá'],
      fromDate: today,
      toDate: today,
    });

    expect(await tasksOn(today)).toEqual(['Cho ăn sáng', 'Ngâm chân nước đá']);
    const listed = await careTasks.listForHorse(trainer, gio);
    expect(
      listed.map((task) => [task.taskType.name, task.mode]).sort(),
    ).toEqual([
      ['Ngâm chân nước đá', HorseCareTaskMode.EXTRA],
      ['Tắm rửa', HorseCareTaskMode.EXEMPT],
    ]);
  });

  it('refuses to exempt a task that is not for every horse, or without a reason', async () => {
    await expect(exempt('Ngâm chân nước đá')).rejects.toThrow(
      new ConflictException(
        'Loại việc Ngâm chân nước đá không áp cho mọi ngựa, không cần miễn',
      ),
    );
    await expect(
      careTasks.createForHorse(trainer, gio, {
        taskTypeId: types['Tắm rửa'],
        mode: HorseCareTaskMode.EXEMPT,
        fromDate: today,
        toDate: today,
        note: '   ',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('refuses to switch "for every horse" while an exemption or extra task is still open', async () => {
    const exemption = await exempt(
      'Tắm rửa',
      shiftDays(today, 1),
      shiftDays(today, 3),
    );

    await expect(
      careTasks.updateType(manager, types['Tắm rửa'], { appliesToAll: false }),
    ).rejects.toThrow(ConflictException);
    await expect(
      careTasks.updateType(manager, types['Tắm rửa'], { name: 'Tắm' }),
    ).resolves.toMatchObject({ name: 'Tắm' });

    await careTasks.removeForHorse(trainer, exemption.id);
    await expect(
      careTasks.updateType(manager, types['Tắm rửa'], { appliesToAll: false }),
    ).resolves.toMatchObject({ appliesToAll: false });
  });
});

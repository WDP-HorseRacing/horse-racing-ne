import { ConflictException, ForbiddenException } from '@nestjs/common';
import type { Model } from 'mongoose';
import { DataSource } from 'typeorm';
import { UserRole } from '../../src/common/enums/role.enum';
import { DomainEventPublisher } from '../../src/common/infrastructure/events/domain-event.publisher';
import type { Actor } from '../../src/common/types/actor';
import {
  clubToday,
  shiftDays,
  toDisplayDate,
} from '../../src/common/utils/club-date';
import { AuditService } from '../../src/modules/audit/services/audit.service';
import { HorseAccessService } from '../../src/modules/horses/shared/horse-access.service';
import { CareTaskChangedListener } from '../../src/modules/notifications/delivery/care-task-changed.listener';
import { HorseNotificationsService } from '../../src/modules/notifications/delivery/horse-notifications.service';
import { NotificationDeliveryService } from '../../src/modules/notifications/delivery/notification-delivery.service';
import { NotificationRecipientsRepository } from '../../src/modules/notifications/delivery/notification-recipients.repository';
import {
  NotificationRecord,
  NotificationSchema,
} from '../../src/modules/notifications/schemas/notification.schema';
import { CareTasksService } from '../../src/modules/stable/care-tasks/care-tasks.service';
import { HorseCareTaskMode } from '../../src/modules/stable/constants/horse-care-task-mode.enum';
import { CARE_TASK_CHANGED_EVENT } from '../../src/modules/stable/constants/stable-events.constants';
import { ChecklistsService } from '../../src/modules/stable/daily-checklists/checklists.service';
import { CareTaskTypeEntity } from '../../src/modules/stable/entities/care-task-type.entity';
import { DailyChecklistEntity } from '../../src/modules/stable/entities/daily-checklist.entity';
import { HorseCareTaskEntity } from '../../src/modules/stable/entities/horse-care-task.entity';
import { DailyChecklistsService } from '../../src/modules/stable/shared/daily-checklists.service';
import { StableAccessService } from '../../src/modules/stable/shared/stable-access.service';
import type { CareTaskChangedEvent } from '../../src/modules/stable/types/stable-events.types';
import { fixtures } from './fixtures';
import {
  clearAllMongoCollections,
  startTestMongo,
  stopTestMongo,
  type TestMongo,
} from './mongo';
import {
  startTestPostgres,
  stopTestPostgres,
  truncateAllTables,
  type TestPostgres,
} from './postgres';

describe('Veterinarians changing private care tasks of any horse (Postgres)', () => {
  let db: TestPostgres;
  let mongo: TestMongo;
  let dataSource: DataSource;
  let model: Model<NotificationRecord>;
  let seed: ReturnType<typeof fixtures>;
  let checklists: ChecklistsService;
  let careTasks: CareTasksService;
  let listener: CareTaskChangedListener;
  let manager: Actor;
  let trainer: Actor;
  let vet: Actor;
  let trainerId: string;
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

  const tasksToday = async () => {
    const [checklist] = await checklists.listForHorse(manager, gio, {
      from: today,
      to: today,
    });
    return checklist?.items.map((item) => item.name);
  };

  const outbox = () =>
    dataSource.query<{ payload: CareTaskChangedEvent }[]>(
      'SELECT payload FROM outbox_events WHERE event_name = $1 ORDER BY created_at',
      [CARE_TASK_CHANGED_EVENT],
    );

  const deliverAll = async () => {
    for (const row of await outbox()) {
      await listener.handle(row.payload);
      await listener.handle(row.payload);
    }
    return model
      .find({}, { _id: 0, recipientId: 1, category: 1, message: 1 })
      .sort({ createdAt: 1 })
      .lean();
  };

  beforeAll(async () => {
    db = await startTestPostgres();
    mongo = await startTestMongo();
    dataSource = db.dataSource;
    model = mongo.connection.model(NotificationRecord.name, NotificationSchema);
    await model.init();
    seed = fixtures(dataSource);
    const access = new StableAccessService(new HorseAccessService(dataSource));
    const events = new DomainEventPublisher();
    const daily = new DailyChecklistsService(events);
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
      events,
    );
    listener = new CareTaskChangedListener(
      new HorseNotificationsService(
        new NotificationRecipientsRepository(dataSource),
        new NotificationDeliveryService(model, [], null),
        dataSource,
      ),
    );
  });

  afterAll(async () => {
    await stopTestPostgres(db);
    await stopTestMongo(mongo);
  });

  beforeEach(async () => {
    await truncateAllTables(dataSource);
    await clearAllMongoCollections(mongo.connection);
    today = clubToday();
    manager = await actorOf(
      await seed.user(UserRole.CLUB_MANAGER),
      UserRole.CLUB_MANAGER,
    );
    trainerId = await seed.user(UserRole.HEAD_TRAINER);
    trainer = await actorOf(trainerId, UserRole.HEAD_TRAINER);
    const vetId = await seed.user(UserRole.VETERINARIAN);
    await dataSource.query(`UPDATE users SET full_name = 'Lan' WHERE id = $1`, [
      vetId,
    ]);
    vet = await actorOf(vetId, UserRole.VETERINARIAN);
    const groomId = await seed.user(UserRole.GROOM);
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
    await checklists.generateDay(today);
  });

  it('adds an extra task to today, lists it, and tells the head trainer of the barn', async () => {
    await careTasks.createForHorse(vet, gio, {
      taskTypeId: types['Ngâm chân nước đá'],
      fromDate: today,
      toDate: shiftDays(today, 2),
      note: 'Chân trước sưng',
    });

    expect(await tasksToday()).toEqual([
      'Cho ăn sáng',
      'Tắm rửa',
      'Ngâm chân nước đá',
    ]);
    await expect(careTasks.listForHorse(vet, gio)).resolves.toEqual([
      expect.objectContaining({ mode: HorseCareTaskMode.EXTRA }) as unknown,
    ]);
    expect(await deliverAll()).toEqual([
      {
        recipientId: trainerId,
        category: 'DAILY_CHECKLIST',
        message: `Bác sĩ Lan gắn thêm việc "Ngâm chân nước đá" (từ ${toDisplayDate(today)} đến ${toDisplayDate(shiftDays(today, 2))}) cho ngựa Gió. Lý do: Chân trước sưng.`,
      },
    ]);
  });

  it('exempts a shared task, dropping its unticked line today, then removes the exemption', async () => {
    const exemption = await careTasks.createForHorse(vet, gio, {
      taskTypeId: types['Tắm rửa'],
      mode: HorseCareTaskMode.EXEMPT,
      fromDate: today,
      toDate: today,
      note: 'Đang sốt, kiêng tắm',
    });
    expect(await tasksToday()).toEqual(['Cho ăn sáng']);

    await careTasks.removeForHorse(vet, exemption.id);

    expect(await tasksToday()).toEqual(['Cho ăn sáng', 'Tắm rửa']);
    const range = `từ ${toDisplayDate(today)} đến ${toDisplayDate(today)}`;
    expect(
      (await deliverAll()).map(({ recipientId, message }) => [
        recipientId,
        message,
      ]),
    ).toEqual([
      [
        trainerId,
        `Bác sĩ Lan miễn việc "Tắm rửa" (${range}) cho ngựa Gió. Lý do: Đang sốt, kiêng tắm.`,
      ],
      [
        trainerId,
        `Bác sĩ Lan gỡ miễn việc "Tắm rửa" (${range}) cho ngựa Gió. Lý do: Đang sốt, kiêng tắm.`,
      ],
    ]);
  });

  it('keeps the same rules as head trainers: overlapping range and read-only horse', async () => {
    const body = {
      taskTypeId: types['Ngâm chân nước đá'],
      fromDate: today,
      toDate: today,
    };
    await careTasks.createForHorse(vet, gio, body);
    await expect(careTasks.createForHorse(vet, gio, body)).rejects.toThrow(
      ConflictException,
    );

    await dataSource.query(
      `UPDATE horses SET lifecycle_status = 'DECEASED' WHERE id = $1`,
      [gio],
    );
    await expect(
      careTasks.createForHorse(vet, gio, {
        ...body,
        taskTypeId: types['Tắm rửa'],
        mode: HorseCareTaskMode.EXEMPT,
        note: 'Kiêng tắm',
      }),
    ).rejects.toThrow(ConflictException);
  });

  it('works on a horse whose barn has no head trainer, telling nobody', async () => {
    await dataSource.query('UPDATE barns SET head_trainer_id = NULL');

    await careTasks.createForHorse(vet, gio, {
      taskTypeId: types['Ngâm chân nước đá'],
      fromDate: today,
      toDate: today,
    });

    expect(await outbox()).toHaveLength(1);
    expect(await deliverAll()).toEqual([]);
  });

  it('records no event when the head trainer of the barn makes the change', async () => {
    const task = await careTasks.createForHorse(trainer, gio, {
      taskTypeId: types['Ngâm chân nước đá'],
      fromDate: today,
      toDate: today,
    });
    await careTasks.removeForHorse(trainer, task.id);

    expect(await outbox()).toEqual([]);
  });

  it('still keeps head trainers to their own barn', async () => {
    const other = await actorOf(
      await seed.user(UserRole.HEAD_TRAINER),
      UserRole.HEAD_TRAINER,
    );

    await expect(
      careTasks.createForHorse(other, gio, {
        taskTypeId: types['Ngâm chân nước đá'],
        fromDate: today,
        toDate: today,
      }),
    ).rejects.toThrow(
      new ForbiddenException('Ngựa không thuộc khu bạn phụ trách'),
    );
  });
});

import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { UserRole } from '../../src/common/enums/role.enum';
import { NotificationPriority } from '../../src/modules/notifications/constants/notification-priority.enum';
import { NotificationType } from '../../src/modules/notifications/constants/notification-type.enum';
import { NotificationEntity } from '../../src/modules/notifications/entities/notification.entity';
import { NotificationsService } from '../../src/modules/notifications/services/notifications.service';
import type { RealtimeGateway } from '../../src/modules/realtime/realtime.gateway';
import { fixtures } from './fixtures';
import {
  startTestDatabase,
  stopTestDatabase,
  truncateAll,
  type TestDatabase,
} from './postgres';

describe('NotificationsService.send (Postgres)', () => {
  let db: TestDatabase;
  let dataSource: DataSource;
  let seed: ReturnType<typeof fixtures>;
  let emitToUser: jest.Mock;
  let service: NotificationsService;

  beforeAll(async () => {
    db = await startTestDatabase();
    dataSource = db.dataSource;
    seed = fixtures(dataSource);
  });

  afterAll(() => stopTestDatabase(db));

  beforeEach(async () => {
    await truncateAll(dataSource);
    emitToUser = jest.fn();
    service = new NotificationsService(
      dataSource.getRepository(NotificationEntity),
      { emitToUser } as unknown as RealtimeGateway,
    );
  });

  const draft = (eventId: string, recipientIds: string[]) => ({
    eventId,
    recipientIds,
    type: NotificationType.WARNING,
    priority: NotificationPriority.URGENT,
    title: 'KHẨN',
    message: 'Ngựa sốt',
  });

  const storedFor = (recipientId: string) =>
    dataSource.query<
      Array<{
        event_id: string;
        type: string;
        priority: string;
        title: string;
        message: string;
        read_at: Date | null;
      }>
    >(
      `SELECT event_id, type, priority, title, message, read_at
         FROM notifications WHERE recipient_id = $1`,
      [recipientId],
    );

  it('stores one unread notification per distinct recipient and pushes each one realtime', async () => {
    const vet = await seed.user(UserRole.VETERINARIAN);
    const trainer = await seed.user(UserRole.HEAD_TRAINER);
    const eventId = randomUUID();

    const sent = await service.send(draft(eventId, [vet, trainer, vet]));

    expect(sent.sort()).toEqual([vet, trainer].sort());
    for (const recipient of [vet, trainer]) {
      expect(await storedFor(recipient)).toEqual([
        {
          event_id: eventId,
          type: 'WARNING',
          priority: 'URGENT',
          title: 'KHẨN',
          message: 'Ngựa sốt',
          read_at: null,
        },
      ]);
    }
    expect(emitToUser).toHaveBeenCalledTimes(2);
    const [recipient, event, payload] = emitToUser.mock.calls.find(
      ([userId]) => userId === vet,
    ) as [string, string, Record<string, unknown>];
    expect([recipient, event]).toEqual([vet, 'notification.created']);
    expect(Object.keys(payload).sort()).toEqual(
      ['createdAt', 'id', 'message', 'priority', 'title', 'type'].sort(),
    );
    expect(payload).toMatchObject({
      type: NotificationType.WARNING,
      priority: NotificationPriority.URGENT,
      title: 'KHẨN',
      message: 'Ngựa sốt',
    });
    expect(typeof payload.id).toBe('string');
    expect(payload.createdAt).toBeInstanceOf(Date);
  });

  it('skips recipients that already have the event and pushes only the new ones', async () => {
    const vet = await seed.user(UserRole.VETERINARIAN);
    const trainer = await seed.user(UserRole.HEAD_TRAINER);
    const eventId = randomUUID();
    await service.send(draft(eventId, [vet]));
    emitToUser.mockClear();

    const sent = await service.send(draft(eventId, [vet, trainer]));

    expect(sent).toEqual([trainer]);
    expect(await storedFor(vet)).toHaveLength(1);
    expect(emitToUser).toHaveBeenCalledTimes(1);
    expect(emitToUser).toHaveBeenCalledWith(
      trainer,
      'notification.created',
      expect.anything(),
    );
  });

  it('stores nothing twice when the same event is sent concurrently', async () => {
    const vet = await seed.user(UserRole.VETERINARIAN);
    const eventId = randomUUID();

    const results = await Promise.all([
      service.send(draft(eventId, [vet])),
      service.send(draft(eventId, [vet])),
    ]);

    expect(results.flat()).toEqual([vet]);
    expect(await storedFor(vet)).toHaveLength(1);
    expect(emitToUser).toHaveBeenCalledTimes(1);
  });

  it('keeps a different event for the same recipient', async () => {
    const vet = await seed.user(UserRole.VETERINARIAN);

    await service.send(draft(randomUUID(), [vet]));
    await service.send(draft(randomUUID(), [vet]));

    expect(await storedFor(vet)).toHaveLength(2);
  });

  it('writes nothing for an empty recipient list', async () => {
    await expect(service.send(draft(randomUUID(), []))).resolves.toEqual([]);
    expect(emitToUser).not.toHaveBeenCalled();
  });

  it('keeps the stored notification when the realtime push fails', async () => {
    const vet = await seed.user(UserRole.VETERINARIAN);
    emitToUser.mockImplementation(() => {
      throw new Error('gateway chưa sẵn sàng');
    });

    await expect(service.send(draft(randomUUID(), [vet]))).resolves.toEqual([
      vet,
    ]);
    expect(await storedFor(vet)).toHaveLength(1);
  });
});

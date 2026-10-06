import type { Model } from 'mongoose';
import { randomUUID } from 'node:crypto';
import { NotificationPriority } from '../../src/modules/notifications/enums/notification-priority.enum';
import { NotificationResourceType } from '../../src/modules/notifications/enums/notification-resource-type.enum';
import { NotificationCategory } from '../../src/modules/notifications/enums/notification-category.enum';
import { RealtimeChannel } from '../../src/modules/notifications/delivery/realtime.channel';
import { NotificationDeliveryService } from '../../src/modules/notifications/delivery/notification-delivery.service';
import {
  NotificationRecord,
  NotificationSchema,
} from '../../src/modules/notifications/schemas/notification.schema';
import type { RealtimeGateway } from '../../src/modules/realtime/realtime.gateway';
import {
  clearAllCollections,
  startTestMongo,
  stopTestMongo,
  type TestMongo,
} from './mongo';

describe('NotificationDeliveryService.send (MongoDB)', () => {
  let mongo: TestMongo;
  let model: Model<NotificationRecord>;
  let emitToUser: jest.Mock;
  let service: NotificationDeliveryService;

  beforeAll(async () => {
    mongo = await startTestMongo();
    model = mongo.connection.model(NotificationRecord.name, NotificationSchema);
    await model.init();
  });

  afterAll(() => stopTestMongo(mongo));

  beforeEach(async () => {
    await clearAllCollections(mongo.connection);
    emitToUser = jest.fn();
    service = new NotificationDeliveryService(model, [
      new RealtimeChannel({ emitToUser } as unknown as RealtimeGateway),
    ]);
  });

  const draft = (eventId: string, recipientIds: string[]) => ({
    eventId,
    recipientIds,
    category: NotificationCategory.MEASUREMENT_ALERT,
    priority: NotificationPriority.URGENT,
    title: 'KHẨN',
    message: 'Ngựa sốt',
    resource: { type: NotificationResourceType.HORSE, id: 'horse-1' },
  });

  const storedFor = (recipientId: string) =>
    model
      .find({ recipientId }, { _id: 0, createdAt: 0, recipientId: 0 })
      .lean();

  it('stores one unread notification per distinct recipient and pushes each one realtime', async () => {
    const vet = randomUUID();
    const trainer = randomUUID();
    const eventId = randomUUID();

    const sent = await service.send(draft(eventId, [vet, trainer, vet]));

    expect(sent.sort()).toEqual([vet, trainer].sort());
    for (const recipient of [vet, trainer]) {
      expect(await storedFor(recipient)).toEqual([
        {
          eventId,
          category: 'MEASUREMENT_ALERT',
          priority: 'URGENT',
          title: 'KHẨN',
          message: 'Ngựa sốt',
          resource: { type: 'HORSE', id: 'horse-1' },
          readAt: null,
        },
      ]);
    }
    expect(emitToUser).toHaveBeenCalledTimes(2);
    const [recipient, event, payload] = emitToUser.mock.calls.find(
      ([userId]) => userId === vet,
    ) as [string, string, Record<string, unknown>];
    expect([recipient, event]).toEqual([vet, 'notification.created']);
    expect(Object.keys(payload).sort()).toEqual(
      [
        'category',
        'createdAt',
        'id',
        'message',
        'priority',
        'resource',
        'title',
      ].sort(),
    );
    expect(payload).toMatchObject({
      category: NotificationCategory.MEASUREMENT_ALERT,
      priority: NotificationPriority.URGENT,
      title: 'KHẨN',
      message: 'Ngựa sốt',
      resource: { type: NotificationResourceType.HORSE, id: 'horse-1' },
    });
    const stored = await model.findOne({ recipientId: vet }).lean();
    expect(payload.id).toBe(stored!._id);
    expect(payload.createdAt).toEqual(stored!.createdAt);
  });

  it('skips recipients that already have the event and pushes only the new ones', async () => {
    const vet = randomUUID();
    const trainer = randomUUID();
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
    const recipients = Array.from({ length: 30 }, () => randomUUID());
    const eventId = randomUUID();

    const results = await Promise.all(
      Array.from({ length: 20 }, () =>
        service.send(draft(eventId, recipients)),
      ),
    );

    expect(results.flat().sort()).toEqual([...recipients].sort());
    expect(await model.countDocuments({ eventId })).toBe(30);
    expect(emitToUser).toHaveBeenCalledTimes(30);
  });

  it('rejects a second stored notification for the same event and recipient', async () => {
    const vet = randomUUID();
    const eventId = randomUUID();
    await service.send(draft(eventId, [vet]));

    await expect(
      model.create({
        eventId,
        recipientId: vet,
        category: NotificationCategory.BARN_ASSIGNED,
        priority: NotificationPriority.NORMAL,
        title: 'T',
        message: 'M',
        createdAt: new Date(),
      }),
    ).rejects.toMatchObject({ code: 11000 });
  });

  it('keeps a different event for the same recipient', async () => {
    const vet = randomUUID();

    await service.send(draft(randomUUID(), [vet]));
    await service.send(draft(randomUUID(), [vet]));

    expect(await storedFor(vet)).toHaveLength(2);
  });

  it('writes nothing for an empty recipient list', async () => {
    await expect(service.send(draft(randomUUID(), []))).resolves.toEqual([]);
    expect(await model.countDocuments()).toBe(0);
    expect(emitToUser).not.toHaveBeenCalled();
  });

  it('keeps the stored notification when the realtime push fails', async () => {
    const vet = randomUUID();
    emitToUser.mockImplementation(() => {
      throw new Error('gateway chưa sẵn sàng');
    });

    await expect(service.send(draft(randomUUID(), [vet]))).resolves.toEqual([
      vet,
    ]);
    expect(await storedFor(vet)).toHaveLength(1);
  });
});

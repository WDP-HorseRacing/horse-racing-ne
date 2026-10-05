import type { Model } from 'mongoose';
import { NotificationPriority } from '../../constants/notification-priority.enum';
import { NotificationResourceType } from '../../constants/notification-resource-type.enum';
import { NotificationType } from '../../constants/notification-type.enum';
import type { Notification } from '../../schemas/notification.schema';
import { NotificationsService } from './notifications.service';

function setup(upsertedIndexes: number[]) {
  const bulkWrite = jest.fn().mockResolvedValue({
    upsertedIds: Object.fromEntries(
      upsertedIndexes.map((index) => [index, `id-${index}`]),
    ),
  });
  const model = { bulkWrite } as unknown as Model<Notification>;
  const first = { deliver: jest.fn().mockResolvedValue(undefined) };
  const second = { deliver: jest.fn().mockResolvedValue(undefined) };
  const service = new NotificationsService(model, [first, second]);
  return { service, bulkWrite, first, second };
}

const draft = {
  eventId: 'event-1',
  type: NotificationType.WARNING,
  priority: NotificationPriority.URGENT,
  title: 'KHẨN',
  message: 'Ngựa sốt',
  resource: { type: NotificationResourceType.HORSE, id: 'horse-1' },
};

type UpsertOperation = {
  updateOne: {
    filter: Record<string, string>;
    update: { $setOnInsert: Notification };
    upsert: boolean;
  };
};

describe('NotificationsService.send', () => {
  it('upserts one notification per distinct recipient keyed by (eventId, recipientId)', async () => {
    const { service, bulkWrite } = setup([0, 1]);

    await service.send({ ...draft, recipientIds: ['vet-1', 'ht-1', 'vet-1'] });

    const [operations, options] = bulkWrite.mock.calls[0] as [
      UpsertOperation[],
      { ordered: boolean },
    ];
    expect(options).toEqual({ ordered: false });
    expect(operations.map(({ updateOne }) => updateOne.filter)).toEqual([
      { eventId: 'event-1', recipientId: 'vet-1' },
      { eventId: 'event-1', recipientId: 'ht-1' },
    ]);
    expect(operations.every(({ updateOne }) => updateOne.upsert)).toBe(true);
    expect(operations[0].updateOne.update.$setOnInsert).toMatchObject({
      eventId: 'event-1',
      recipientId: 'vet-1',
      type: NotificationType.WARNING,
      priority: NotificationPriority.URGENT,
      title: 'KHẨN',
      message: 'Ngựa sốt',
      resource: { type: NotificationResourceType.HORSE, id: 'horse-1' },
      readAt: null,
    });
  });

  it('returns and delivers only the notifications that were newly inserted', async () => {
    const { service, first, second } = setup([1]);

    const result = await service.send({
      ...draft,
      recipientIds: ['vet-1', 'ht-1'],
    });

    expect(result).toEqual(['ht-1']);
    for (const channel of [first, second]) {
      const [delivered] = channel.deliver.mock.calls[0] as [Notification[]];
      expect(delivered.map((n) => n.recipientId)).toEqual(['ht-1']);
    }
  });

  it('delivers nothing when every recipient already has the event', async () => {
    const { service, first } = setup([]);

    await expect(
      service.send({ ...draft, recipientIds: ['vet-1'] }),
    ).resolves.toEqual([]);
    expect(first.deliver).not.toHaveBeenCalled();
  });

  it('does not touch the database when there is no recipient', async () => {
    const { service, bulkWrite } = setup([]);

    await expect(service.send({ ...draft, recipientIds: [] })).resolves.toEqual(
      [],
    );
    expect(bulkWrite).not.toHaveBeenCalled();
  });

  it('keeps going with the next channel when one channel fails', async () => {
    const { service, first, second } = setup([0]);
    first.deliver.mockRejectedValue(new Error('down'));

    await expect(
      service.send({ ...draft, recipientIds: ['vet-1'] }),
    ).resolves.toEqual(['vet-1']);
    expect(second.deliver).toHaveBeenCalledTimes(1);
  });
});

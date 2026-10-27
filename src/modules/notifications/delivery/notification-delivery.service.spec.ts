import type { Model } from 'mongoose';
import { NotificationPriority } from '../enums/notification-priority.enum';
import { NotificationResourceType } from '../enums/notification-resource-type.enum';
import { NotificationCategory } from '../enums/notification-category.enum';
import type { NotificationRecord } from '../schemas/notification.schema';
import { NotificationDeliveryService } from './notification-delivery.service';

function setup(
  upsertedIndexes: number[],
  { withPush = false, pending = [] as Partial<NotificationRecord>[] } = {},
) {
  const bulkWrite = jest.fn().mockResolvedValue({
    upsertedIds: Object.fromEntries(
      upsertedIndexes.map((index) => [index, `id-${index}`]),
    ),
  });
  const lean = jest.fn().mockResolvedValue(pending);
  const find = jest.fn().mockReturnValue({ lean });
  const updateMany = jest.fn().mockResolvedValue({});
  const model = {
    bulkWrite,
    find,
    updateMany,
  } as unknown as Model<NotificationRecord>;
  const first = { deliver: jest.fn().mockResolvedValue(undefined) };
  const second = { deliver: jest.fn().mockResolvedValue(undefined) };
  const push = { deliver: jest.fn().mockResolvedValue(undefined) };
  const service = new NotificationDeliveryService(
    model,
    [first, second],
    withPush ? push : null,
  );
  return { service, bulkWrite, find, updateMany, first, second, push };
}

const draft = {
  eventId: 'event-1',
  category: NotificationCategory.MEASUREMENT_ALERT,
  priority: NotificationPriority.URGENT,
  title: 'KHẨN',
  message: 'Ngựa sốt',
  resource: {
    type: NotificationResourceType.HORSE,
    id: 'horse-1',
    horseId: 'horse-1',
  },
};

type UpsertOperation = {
  updateOne: {
    filter: Record<string, string>;
    update: { $setOnInsert: NotificationRecord };
    upsert: boolean;
  };
};

describe('NotificationDeliveryService.send', () => {
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
      category: NotificationCategory.MEASUREMENT_ALERT,
      priority: NotificationPriority.URGENT,
      title: 'KHẨN',
      message: 'Ngựa sốt',
      resource: {
        type: NotificationResourceType.HORSE,
        id: 'horse-1',
        horseId: 'horse-1',
      },
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
      const [delivered] = channel.deliver.mock.calls[0] as [
        NotificationRecord[],
      ];
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

  it('does not look up pending pushes when there is no push channel', async () => {
    const { service, find, updateMany } = setup([0]);

    await service.send({ ...draft, recipientIds: ['vet-1'] });

    expect(find).not.toHaveBeenCalled();
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('queues every notification of the event still waiting for push, then marks them queued', async () => {
    const pending = [{ _id: 'n-old' }, { _id: 'n-new' }];
    const { service, find, push, updateMany } = setup([1], {
      withPush: true,
      pending,
    });

    await expect(
      service.send({ ...draft, recipientIds: ['vet-1', 'ht-1', 'vet-1'] }),
    ).resolves.toEqual(['ht-1']);

    expect(find).toHaveBeenCalledWith({
      eventId: 'event-1',
      recipientId: { $in: ['vet-1', 'ht-1'] },
      pushQueuedAt: null,
    });
    expect(push.deliver).toHaveBeenCalledWith(pending);
    expect(updateMany).toHaveBeenCalledWith(
      { _id: { $in: ['n-old', 'n-new'] } },
      { $set: { pushQueuedAt: expect.any(Date) as Date } },
    );
  });

  it('skips the push channel when nothing is waiting for push', async () => {
    const { service, push, updateMany } = setup([], { withPush: true });

    await expect(
      service.send({ ...draft, recipientIds: ['vet-1'] }),
    ).resolves.toEqual([]);
    expect(push.deliver).not.toHaveBeenCalled();
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('throws and leaves notifications unmarked when the push queue fails', async () => {
    const { service, push, updateMany, first } = setup([0], {
      withPush: true,
      pending: [{ _id: 'n-1' }],
    });
    push.deliver.mockRejectedValue(new Error('redis down'));

    await expect(
      service.send({ ...draft, recipientIds: ['vet-1'] }),
    ).rejects.toThrow('redis down');
    expect(first.deliver).toHaveBeenCalledTimes(1);
    expect(updateMany).not.toHaveBeenCalled();
  });
});

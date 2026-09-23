import { Repository } from 'typeorm';
import { RealtimeGateway } from '../../realtime/realtime.gateway';
import { NotificationPriority } from '../constants/notification-priority.enum';
import { NotificationType } from '../constants/notification-type.enum';
import { NotificationEntity } from '../entities/notification.entity';
import { NotificationsService } from './notifications.service';

function setup(raw: Array<Record<string, unknown>>) {
  const builder = {
    insert: jest.fn().mockReturnThis(),
    into: jest.fn().mockReturnThis(),
    values: jest.fn().mockReturnThis(),
    orIgnore: jest.fn().mockReturnThis(),
    returning: jest.fn().mockReturnThis(),
    execute: jest.fn().mockResolvedValue({ raw }),
  };
  const createQueryBuilder = jest.fn(() => builder);
  const repository = {
    createQueryBuilder,
  } as unknown as Repository<NotificationEntity>;
  const gateway = { emitToUser: jest.fn() };
  const service = new NotificationsService(
    repository,
    gateway as unknown as RealtimeGateway,
  );
  return { service, builder, createQueryBuilder, gateway };
}

const draft = {
  eventId: 'event-1',
  type: NotificationType.WARNING,
  priority: NotificationPriority.URGENT,
  title: 'KHẨN',
  message: 'Ngựa sốt',
};

describe('NotificationsService.send', () => {
  it('inserts one row per distinct recipient and ignores (eventId, recipientId) conflicts', async () => {
    const createdAt = new Date('2026-09-23T00:00:00Z');
    const { service, builder, gateway } = setup([
      { id: 'n1', recipient_id: 'vet-1', created_at: createdAt },
      { id: 'n2', recipient_id: 'ht-1', created_at: createdAt },
    ]);

    const result = await service.send({
      ...draft,
      recipientIds: ['vet-1', 'ht-1', 'vet-1'],
    });

    expect(builder.orIgnore).toHaveBeenCalled();
    expect(builder.values).toHaveBeenCalledWith([
      expect.objectContaining({ eventId: 'event-1', recipientId: 'vet-1' }),
      expect.objectContaining({ eventId: 'event-1', recipientId: 'ht-1' }),
    ]);
    expect(result).toEqual(['vet-1', 'ht-1']);
    expect(gateway.emitToUser).toHaveBeenCalledTimes(2);
    expect(gateway.emitToUser).toHaveBeenCalledWith(
      'vet-1',
      'notification.created',
      expect.objectContaining({
        id: 'n1',
        priority: NotificationPriority.URGENT,
      }),
    );
  });

  it('skips realtime and returns nothing new when every row already exists (replayed event)', async () => {
    const { service, gateway } = setup([]);

    const result = await service.send({ ...draft, recipientIds: ['vet-1'] });

    expect(result).toEqual([]);
    expect(gateway.emitToUser).not.toHaveBeenCalled();
  });

  it('does not touch the database when there is no recipient', async () => {
    const { service, createQueryBuilder } = setup([]);

    const result = await service.send({ ...draft, recipientIds: [] });

    expect(result).toEqual([]);
    expect(createQueryBuilder).not.toHaveBeenCalled();
  });

  it('keeps the saved rows when the realtime push fails', async () => {
    const { service, gateway } = setup([
      { id: 'n1', recipient_id: 'vet-1', created_at: new Date() },
    ]);
    gateway.emitToUser.mockImplementation(() => {
      throw new Error('server not ready');
    });

    await expect(
      service.send({ ...draft, recipientIds: ['vet-1'] }),
    ).resolves.toEqual(['vet-1']);
  });
});

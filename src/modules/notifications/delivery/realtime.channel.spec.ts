import type { RealtimeGateway } from '../../realtime/realtime.gateway';
import { NotificationPriority } from '../enums/notification-priority.enum';
import { NotificationCategory } from '../enums/notification-category.enum';
import type { NotificationRecord } from '../schemas/notification.schema';
import { RealtimeChannel } from './realtime.channel';

const notification = (id: string, recipientId: string): NotificationRecord => ({
  _id: id,
  eventId: 'event-1',
  recipientId,
  category: NotificationCategory.BARN_ASSIGNED,
  priority: NotificationPriority.NORMAL,
  title: 'T',
  message: 'M',
  resource: null,
  readAt: null,
  createdAt: new Date('2026-10-05T00:00:00Z'),
});

describe('RealtimeChannel.deliver', () => {
  it('pushes each notification to its recipient room and keeps going after a failed push', async () => {
    const emitToUser = jest
      .fn()
      .mockImplementationOnce(() => {
        throw new Error('server not ready');
      })
      .mockImplementation(() => undefined);
    const channel = new RealtimeChannel({
      emitToUser,
    } as unknown as RealtimeGateway);

    await channel.deliver([notification('n1', 'u1'), notification('n2', 'u2')]);

    expect(emitToUser).toHaveBeenCalledTimes(2);
    expect(emitToUser).toHaveBeenLastCalledWith('u2', 'notification.created', {
      id: 'n2',
      category: NotificationCategory.BARN_ASSIGNED,
      priority: NotificationPriority.NORMAL,
      title: 'T',
      message: 'M',
      resource: null,
      createdAt: new Date('2026-10-05T00:00:00Z'),
    });
  });
});

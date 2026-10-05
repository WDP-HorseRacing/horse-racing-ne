import type { Queue } from 'bullmq';
import type { Notification } from '../../schemas/notification.schema';
import type { NotificationPushJob } from '../push/notification-push.types';
import { FcmChannel } from './fcm.channel';

describe('FcmChannel.deliver', () => {
  it('queues one retryable push job per notification keyed by the notification id', async () => {
    const addBulk = jest.fn().mockResolvedValue([]);
    const channel = new FcmChannel({
      addBulk,
    } as unknown as Queue<NotificationPushJob>);

    await channel.deliver([
      { _id: 'n1' } as Notification,
      { _id: 'n2' } as Notification,
    ]);

    expect(addBulk).toHaveBeenCalledWith([
      expect.objectContaining({
        data: { notificationId: 'n1' },
        opts: expect.objectContaining({
          jobId: 'n1',
          attempts: 5,
          backoff: { type: 'exponential', delay: 5000 },
        }) as unknown,
      }),
      expect.objectContaining({
        data: { notificationId: 'n2' },
        opts: expect.objectContaining({ jobId: 'n2' }) as unknown,
      }),
    ]);
  });
});

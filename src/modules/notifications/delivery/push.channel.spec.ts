import type { Queue } from 'bullmq';
import type { NotificationRecord } from '../schemas/notification.schema';
import type { NotificationPushJob } from '../types/notification.types';
import { PushChannel } from './push.channel';

describe('PushChannel.deliver', () => {
  it('queues one retryable push job per notification keyed by the notification id', async () => {
    const addBulk = jest.fn().mockResolvedValue([]);
    const channel = new PushChannel({
      addBulk,
    } as unknown as Queue<NotificationPushJob>);

    await channel.deliver([
      { _id: 'n1' } as NotificationRecord,
      { _id: 'n2' } as NotificationRecord,
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

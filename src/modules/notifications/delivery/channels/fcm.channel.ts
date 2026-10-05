import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import type { Queue } from 'bullmq';
import { NOTIFICATION_PUSH_QUEUE } from '../../constants/notification.constants';
import type { Notification } from '../../schemas/notification.schema';
import type { NotificationPushJob } from '../push/notification-push.types';
import type { NotificationChannel } from './notification-channel';

/**
 * Số lần thử tối đa của một việc gửi push.
 */
const PUSH_ATTEMPTS = 5;

/**
 * Độ trễ gốc (ms) giữa các lần thử, tăng theo cấp số nhân.
 */
const PUSH_BACKOFF_MS = 5_000;

@Injectable()
export class FcmChannel implements NotificationChannel {
  constructor(
    @InjectQueue(NOTIFICATION_PUSH_QUEUE)
    private readonly queue: Queue<NotificationPushJob>,
  ) {}

  /**
   * Đưa mỗi thông báo vào hàng đợi gửi push FCM
   *
   * - jobId là id thông báo: đưa trùng một thông báo không sinh thêm việc
   * - Gửi lỗi tạm thời thì thử lại tối đa PUSH_ATTEMPTS lần, cách nhau tăng dần từ PUSH_BACKOFF_MS
   *
   * @param notifications Các thông báo vừa được lưu mới
   * @returns Promise hoàn tất khi đã đưa vào hàng đợi
   */
  async deliver(notifications: Notification[]): Promise<void> {
    await this.queue.addBulk(
      notifications.map((notification) => ({
        name: 'push',
        data: { notificationId: notification._id },
        opts: {
          jobId: notification._id,
          attempts: PUSH_ATTEMPTS,
          backoff: { type: 'exponential', delay: PUSH_BACKOFF_MS },
          removeOnComplete: true,
          removeOnFail: 1000,
        },
      })),
    );
  }
}

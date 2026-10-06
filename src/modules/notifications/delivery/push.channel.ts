import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import type { Queue } from 'bullmq';
import {
  NOTIFICATION_PUSH_JOB,
  NOTIFICATION_PUSH_QUEUE,
} from '../constants/notification.constants';
import type { NotificationRecord } from '../schemas/notification.schema';
import type {
  NotificationChannel,
  NotificationPushJob,
} from '../types/notification.types';

/**
 * Số lần thử tối đa của một job gửi push.
 */
const PUSH_ATTEMPTS = 5;

/**
 * Độ trễ gốc (ms) giữa các lần thử, tăng theo cấp số nhân.
 */
const PUSH_BACKOFF_MS = 5_000;

/**
 * Thời gian (giây) giữ job đã chạy xong trong hàng đợi.
 */
const COMPLETED_JOB_RETENTION_SECONDS = 86_400;

/**
 * Số job thất bại được giữ lại.
 */
const FAILED_JOB_RETENTION_COUNT = 1000;

@Injectable()
export class PushChannel implements NotificationChannel {
  constructor(
    @InjectQueue(NOTIFICATION_PUSH_QUEUE)
    private readonly queue: Queue<NotificationPushJob>,
  ) {}

  /**
   * Đưa mỗi thông báo vào hàng đợi gửi push
   *
   * - jobId là id thông báo; job đã chạy xong được giữ COMPLETED_JOB_RETENTION_SECONDS giây, nên trong khoảng đó đưa trùng một thông báo không sinh thêm job
   * - Gửi lỗi tạm thời thì thử lại tối đa PUSH_ATTEMPTS lần, cách nhau tăng dần từ PUSH_BACKOFF_MS
   *
   * @param notifications Các thông báo vừa được lưu mới
   * @returns Promise hoàn tất khi đã đưa vào hàng đợi
   */
  async deliver(notifications: NotificationRecord[]): Promise<void> {
    await this.queue.addBulk(
      notifications.map((notification) => ({
        name: NOTIFICATION_PUSH_JOB,
        data: { notificationId: notification._id },
        opts: {
          jobId: notification._id,
          attempts: PUSH_ATTEMPTS,
          backoff: { type: 'exponential', delay: PUSH_BACKOFF_MS },
          removeOnComplete: { age: COMPLETED_JOB_RETENTION_SECONDS },
          removeOnFail: FAILED_JOB_RETENTION_COUNT,
        },
      })),
    );
  }
}

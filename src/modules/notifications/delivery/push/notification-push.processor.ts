import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Job } from 'bullmq';
import type { Messaging } from 'firebase-admin/messaging';
import type { Model } from 'mongoose';
import { NOTIFICATION_PUSH_QUEUE } from '../../constants/notification.constants';
import { Notification } from '../../schemas/notification.schema';
import { UserDevice } from '../../schemas/user-device.schema';
import { FIREBASE_MESSAGING } from './firebase-messaging.provider';
import type { NotificationPushJob } from './notification-push.types';
import { toPushMessage } from './push-message.mapper';

/**
 * Mã lỗi FCM cho biết token không còn dùng được, cần xóa khỏi user_devices.
 */
const DEAD_TOKEN_CODES = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
]);

/**
 * Mã lỗi FCM tạm thời, gửi lại sau sẽ có thể thành công.
 */
const RETRYABLE_CODES = new Set([
  'messaging/server-unavailable',
  'messaging/internal-error',
  'messaging/message-rate-exceeded',
  'messaging/device-message-rate-exceeded',
  'messaging/unknown-error',
]);

@Processor(NOTIFICATION_PUSH_QUEUE)
export class NotificationPushProcessor extends WorkerHost {
  private readonly logger = new Logger(NotificationPushProcessor.name);

  constructor(
    @InjectModel(Notification.name)
    private readonly notifications: Model<Notification>,
    @InjectModel(UserDevice.name)
    private readonly devices: Model<UserDevice>,
    @Inject(FIREBASE_MESSAGING)
    private readonly messaging: Messaging | null,
  ) {
    super();
  }

  /**
   * Gửi push FCM của một thông báo tới các thiết bị của người nhận
   *
   * - Không cấu hình Firebase, không còn thông báo hoặc người nhận không có thiết bị: bỏ qua
   * - Token bị FCM báo không còn hiệu lực: xóa khỏi user_devices
   * - Token gặp lỗi tạm thời: lưu lại danh sách token đó vào job rồi ném lỗi để BullMQ gửi lại riêng các token này
   * - Lỗi khác: chỉ log
   *
   * @param job Việc gửi push của một thông báo
   * @returns Promise hoàn tất khi đã gửi xong
   * @throws Error Nếu còn token gặp lỗi tạm thời cần gửi lại
   */
  async process(job: Job<NotificationPushJob>): Promise<void> {
    if (!this.messaging) return;
    const notification = await this.notifications
      .findById(job.data.notificationId)
      .lean<Notification>();
    if (!notification) return;

    const tokens =
      job.data.tokens ??
      (
        await this.devices
          .find({ userId: notification.recipientId }, { _id: 1 })
          .lean<Pick<UserDevice, '_id'>[]>()
      ).map((device) => device._id);
    if (tokens.length === 0) return;

    const result = await this.messaging.sendEachForMulticast(
      toPushMessage(notification, tokens),
    );

    const dead: string[] = [];
    const retry: string[] = [];
    result.responses.forEach((response, index) => {
      if (response.success) return;
      const code = response.error?.code ?? 'messaging/unknown-error';
      if (DEAD_TOKEN_CODES.has(code)) {
        dead.push(tokens[index]);
      } else if (RETRYABLE_CODES.has(code)) {
        retry.push(tokens[index]);
      } else {
        this.logger.error(
          `Gửi push thông báo ${notification._id} thất bại (${code}): ${response.error?.message}`,
        );
      }
    });

    if (dead.length > 0) {
      await this.devices.deleteMany({ _id: { $in: dead } });
    }
    if (retry.length > 0) {
      await job.updateData({ ...job.data, tokens: retry });
      throw new Error(
        `Còn ${retry.length} thiết bị chưa nhận được push thông báo ${notification._id}`,
      );
    }
  }
}

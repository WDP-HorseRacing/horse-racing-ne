import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Job } from 'bullmq';
import type { Messaging } from 'firebase-admin/messaging';
import type { Model } from 'mongoose';
import { FIREBASE_MESSAGING } from '../../../common/infrastructure/firebase/firebase.token';
import { NOTIFICATION_PUSH_QUEUE } from '../constants/notification.constants';
import { toPushMessage } from '../mappers/notification.mapper';
import { classifyPushFailures } from '../policies/notification-push.policy';
import { NotificationRecord } from '../schemas/notification.schema';
import { UserDevice } from '../schemas/user-device.schema';
import type { NotificationPushJob } from '../types/notification.types';

@Processor(NOTIFICATION_PUSH_QUEUE)
export class NotificationPushProcessor extends WorkerHost {
  private readonly logger = new Logger(NotificationPushProcessor.name);

  constructor(
    @InjectModel(NotificationRecord.name)
    private readonly notifications: Model<NotificationRecord>,
    @InjectModel(UserDevice.name)
    private readonly devices: Model<UserDevice>,
    @Inject(FIREBASE_MESSAGING)
    private readonly messaging: Messaging | null,
  ) {
    super();
  }

  /**
   * Gửi push của một thông báo tới các thiết bị của người nhận
   *
   * - Không cấu hình Firebase, không còn thông báo hoặc người nhận không có thiết bị: bỏ qua
   * - Token bị FCM báo không còn hiệu lực: xóa khỏi user_devices
   * - Token gặp lỗi tạm thời: lưu vào retryTokens của job rồi ném lỗi để BullMQ gửi lại riêng các token này
   * - Lỗi khác: chỉ log
   *
   * @param job Job gửi push của một thông báo
   * @returns Promise hoàn tất khi đã gửi xong
   * @throws Error Nếu còn token gặp lỗi tạm thời cần gửi lại
   */
  async process(job: Job<NotificationPushJob>): Promise<void> {
    if (!this.messaging) return;
    const notification = await this.notifications
      .findById(job.data.notificationId)
      .lean<NotificationRecord>();
    if (!notification) return;

    const tokens =
      job.data.retryTokens ??
      (
        await this.devices
          .find({ userId: notification.recipientId }, { _id: 1 })
          .lean<Pick<UserDevice, '_id'>[]>()
      ).map((device) => device._id);
    if (tokens.length === 0) return;

    const result = await this.messaging.sendEachForMulticast(
      toPushMessage(notification, tokens),
    );
    const { dead, retry, failed } = classifyPushFailures(
      tokens,
      result.responses,
    );

    for (const failure of failed) {
      this.logger.error(
        `Gửi push thông báo ${notification._id} thất bại (${failure.code}): ${failure.message}`,
      );
    }
    if (dead.length > 0) {
      await this.devices.deleteMany({ _id: { $in: dead } });
    }
    if (retry.length > 0) {
      await job.updateData({ ...job.data, retryTokens: retry });
      throw new Error(
        `Còn ${retry.length} thiết bị chưa nhận được push thông báo ${notification._id}`,
      );
    }
  }
}

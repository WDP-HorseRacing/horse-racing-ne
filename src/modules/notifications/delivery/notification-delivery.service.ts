import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { randomUUID } from 'node:crypto';
import { NotificationRecord } from '../schemas/notification.schema';
import {
  NOTIFICATION_CHANNELS,
  NOTIFICATION_PUSH_CHANNEL,
} from '../constants/notification.constants';
import type {
  NotificationChannel,
  NotificationDraft,
} from '../types/notification.types';

@Injectable()
export class NotificationDeliveryService {
  private readonly logger = new Logger(NotificationDeliveryService.name);

  constructor(
    @InjectModel(NotificationRecord.name)
    private readonly notifications: Model<NotificationRecord>,
    @Inject(NOTIFICATION_CHANNELS)
    private readonly channels: NotificationChannel[],
    @Inject(NOTIFICATION_PUSH_CHANNEL)
    private readonly push: NotificationChannel | null,
  ) {}

  /**
   * Gửi một thông báo cho danh sách người nhận: lưu vào collection notifications, giao qua các kênh rồi đưa vào hàng đợi push
   *
   * - Idempotent theo (eventId, recipientId): người đã có thông báo của eventId này bị bỏ qua, gọi lại hay gọi đồng thời cùng eventId không sinh thông báo trùng
   * - Người nhận trùng trong danh sách chỉ được lưu một lần
   * - Chỉ thông báo mới lưu mới được giao qua các kênh; một kênh lỗi chỉ được log, không làm hỏng việc lưu và không chặn kênh khác
   * - Có kênh push: mọi thông báo của eventId cho các người nhận này còn `pushQueuedAt` null (kể cả thông báo lưu từ lần gọi trước) được đưa vào hàng đợi push
   *
   * @param draft Nội dung thông báo và danh sách người nhận
   * @returns Promise trả về danh sách id người nhận vừa được lưu mới (bỏ qua người đã có thông báo của eventId này)
   * @throws Error Nếu không đưa được thông báo vào hàng đợi push; thông báo đã lưu giữ nguyên `pushQueuedAt` null để lần gọi sau đưa lại
   */
  async send(draft: NotificationDraft): Promise<string[]> {
    const recipientIds = [...new Set(draft.recipientIds)];
    if (recipientIds.length === 0) {
      return [];
    }

    const createdAt = new Date();
    const candidates: NotificationRecord[] = recipientIds.map(
      (recipientId) => ({
        _id: randomUUID(),
        eventId: draft.eventId,
        recipientId,
        category: draft.category,
        priority: draft.priority,
        title: draft.title,
        message: draft.message,
        resource: draft.resource,
        readAt: null,
        createdAt,
        pushQueuedAt: null,
      }),
    );

    // Gom thành một lần gọi
    const result = await this.notifications.bulkWrite(
      candidates.map((notification) => ({
        updateOne: {
          filter: {
            eventId: notification.eventId,
            recipientId: notification.recipientId,
          },
          // Nếu đã có thông báo rồi thì bỏ qua, không update gì cả; nếu chưa có thì insert
          update: { $setOnInsert: notification },
          upsert: true,
        },
      })),
      // Nếu một thao tác lỗi thì mấy hằng khác vẫn chạy được (các thao tác không phụ thuộc nhau)
      { ordered: false },
    );

    const created = Object.keys(result.upsertedIds).map(
      (index) => candidates[Number(index)],
    );
    await this.deliver(created);
    await this.queuePush(draft.eventId, recipientIds);
    return created.map((notification) => notification.recipientId);
  }

  /**
   * Đưa vào hàng đợi push các thông báo của một sự kiện chưa được đưa, rồi đánh dấu `pushQueuedAt`
   *
   * - Không có kênh push hoặc không còn thông báo nào có `pushQueuedAt` null: không làm gì
   *
   * @param eventId Id sự kiện của thông báo
   * @param recipientIds Danh sách id người nhận (đã bỏ trùng)
   * @returns Promise hoàn tất khi đã đưa vào hàng đợi và đánh dấu xong
   * @throws Error Nếu kênh push không đưa được vào hàng đợi
   */
  private async queuePush(
    eventId: string,
    recipientIds: string[],
  ): Promise<void> {
    if (!this.push) {
      return;
    }
    const pending = await this.notifications
      .find({
        eventId,
        recipientId: { $in: recipientIds },
        pushQueuedAt: null,
      })
      .lean<NotificationRecord[]>();
    if (pending.length === 0) {
      return;
    }
    await this.push.deliver(pending);
    await this.notifications.updateMany(
      { _id: { $in: pending.map((notification) => notification._id) } },
      { $set: { pushQueuedAt: new Date() } },
    );
  }

  /**
   * Giao các thông báo vừa lưu qua từng kênh; kênh lỗi chỉ được log
   *
   * @param notifications Các thông báo vừa được lưu mới
   * @returns Promise hoàn tất khi mọi kênh đã chạy xong
   */
  private async deliver(notifications: NotificationRecord[]): Promise<void> {
    if (notifications.length === 0) {
      return;
    }
    for (const channel of this.channels) {
      try {
        await channel.deliver(notifications);
      } catch (error) {
        this.logger.warn(
          `Kênh ${channel.constructor.name} không giao được ${notifications.length} thông báo: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
  }
}

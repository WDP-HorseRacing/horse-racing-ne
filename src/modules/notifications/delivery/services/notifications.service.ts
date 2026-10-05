import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { randomUUID } from 'node:crypto';
import { Notification } from '../../schemas/notification.schema';
import type { NotificationDraft } from '../../types/notification.types';
import {
  NOTIFICATION_CHANNELS,
  type NotificationChannel,
} from '../channels/notification-channel';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    @InjectModel(Notification.name)
    private readonly notifications: Model<Notification>,
    @Inject(NOTIFICATION_CHANNELS)
    private readonly channels: NotificationChannel[],
  ) {}

  /**
   * Gửi một thông báo cho danh sách người nhận: lưu vào collection notifications rồi giao qua mọi kênh.
   *
   * - Idempotent theo (eventId, recipientId): người đã có thông báo của eventId này bị bỏ qua, gọi lại hay gọi đồng thời cùng eventId không sinh thông báo trùng
   * - Người nhận trùng trong danh sách chỉ được lưu một lần
   * - Chỉ thông báo mới lưu mới được giao qua các kênh; một kênh lỗi chỉ được log, không làm hỏng việc lưu và không chặn kênh khác
   *
   * @param draft Nội dung thông báo và danh sách người nhận
   * @returns Promise trả về danh sách id người nhận vừa được lưu mới (bỏ qua người đã có thông báo của eventId này)
   */
  async send(draft: NotificationDraft): Promise<string[]> {
    const recipientIds = [...new Set(draft.recipientIds)];
    if (recipientIds.length === 0) {
      return [];
    }

    const createdAt = new Date();
    const candidates: Notification[] = recipientIds.map((recipientId) => ({
      _id: randomUUID(),
      eventId: draft.eventId,
      recipientId,
      type: draft.type,
      priority: draft.priority,
      title: draft.title,
      message: draft.message,
      resource: draft.resource,
      readAt: null,
      createdAt,
    }));

    const result = await this.notifications.bulkWrite(
      candidates.map((notification) => ({
        updateOne: {
          filter: {
            eventId: notification.eventId,
            recipientId: notification.recipientId,
          },
          update: { $setOnInsert: notification },
          upsert: true,
        },
      })),
      { ordered: false },
    );

    const created = Object.keys(result.upsertedIds).map(
      (index) => candidates[Number(index)],
    );
    await this.deliver(created);
    return created.map((notification) => notification.recipientId);
  }

  /**
   * Giao các thông báo vừa lưu qua từng kênh; kênh lỗi chỉ được log
   *
   * @param notifications Các thông báo vừa được lưu mới
   * @returns Promise hoàn tất khi mọi kênh đã chạy xong
   */
  private async deliver(notifications: Notification[]): Promise<void> {
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

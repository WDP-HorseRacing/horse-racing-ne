import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RealtimeGateway } from '../../realtime/realtime.gateway';
import { NOTIFICATION_CREATED_SOCKET_EVENT } from '../constants/notification.constants';
import { NotificationEntity } from '../entities/notification.entity';
import {
  type InsertedNotificationRow,
  toNotificationCreatedPayload,
} from '../mappers/notification.mapper';
import type {
  NotificationCreatedPayload,
  NotificationDraft,
} from '../types/notification.types';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    @InjectRepository(NotificationEntity)
    private readonly notifications: Repository<NotificationEntity>,
    private readonly realtime: RealtimeGateway,
  ) {}

  /**
   * Gửi một thông báo cho danh sách người nhận: lưu vào bảng notifications rồi đẩy realtime.
   *
   * - Gọi SAU khi transaction nghiệp vụ đã commit; hàm tự ghi bằng connection riêng, không nhận EntityManager
   * - Idempotent theo (eventId, recipientId): dòng đã tồn tại bị bỏ qua (ON CONFLICT DO NOTHING), gọi lại cùng eventId không sinh thông báo trùng
   * - Người nhận trùng trong danh sách chỉ được lưu một lần
   * - Chỉ dòng mới lưu mới được đẩy realtime tới room `user:<id>`; đẩy realtime lỗi thì chỉ log, không làm hỏng việc lưu
   *
   * @param draft The notification content and its recipients
   * @returns A promise resolving to danh sách id người nhận vừa được lưu mới (bỏ qua người đã có thông báo của eventId này)
   */
  async send(draft: NotificationDraft): Promise<string[]> {
    const recipientIds = [...new Set(draft.recipientIds)];
    if (recipientIds.length === 0) {
      return [];
    }

    const result = await this.notifications
      .createQueryBuilder()
      .insert()
      .into(NotificationEntity)
      .values(
        recipientIds.map((recipientId) => ({
          eventId: draft.eventId,
          recipientId,
          type: draft.type,
          priority: draft.priority,
          title: draft.title,
          message: draft.message,
          readAt: null,
        })),
      )
      .orIgnore()
      .returning(['id', 'recipientId', 'createdAt'])
      .execute();

    const inserted = result.raw as InsertedNotificationRow[];
    for (const row of inserted) {
      this.pushRealtime(
        row.recipient_id,
        toNotificationCreatedPayload(row, draft),
      );
    }
    return inserted.map((row) => row.recipient_id);
  }

  /**
   * Đẩy một thông báo mới tới các socket của người nhận; lỗi (vd gateway chưa khởi tạo) chỉ được log.
   *
   * @param recipientId The id of the recipient user
   * @param payload The notification data sent to the client
   * @returns Không trả gì
   */
  private pushRealtime(
    recipientId: string,
    payload: NotificationCreatedPayload,
  ): void {
    try {
      this.realtime.emitToUser(
        recipientId,
        NOTIFICATION_CREATED_SOCKET_EVENT,
        payload,
      );
    } catch (error) {
      this.logger.warn(
        `Không đẩy được realtime thông báo ${payload.id} tới ${recipientId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}

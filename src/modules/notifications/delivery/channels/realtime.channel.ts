import { Injectable, Logger } from '@nestjs/common';
import { RealtimeGateway } from '../../../realtime/realtime.gateway';
import { NOTIFICATION_CREATED_SOCKET_EVENT } from '../../constants/notification.constants';
import { toNotificationCreatedPayload } from '../../mappers/notification.mapper';
import type { Notification } from '../../schemas/notification.schema';
import type { NotificationChannel } from './notification-channel';

@Injectable()
export class RealtimeChannel implements NotificationChannel {
  private readonly logger = new Logger(RealtimeChannel.name);

  constructor(private readonly realtime: RealtimeGateway) {}

  /**
   * Đẩy từng thông báo tới room `user:<recipientId>` qua sự kiện NOTIFICATION_CREATED_SOCKET_EVENT
   *
   * - Đẩy lỗi ở một thông báo (vd gateway chưa khởi tạo) chỉ được log, các thông báo còn lại vẫn được đẩy
   *
   * @param notifications Các thông báo vừa được lưu mới
   * @returns Promise hoàn tất khi đã đẩy hết
   */
  deliver(notifications: Notification[]): Promise<void> {
    for (const notification of notifications) {
      try {
        this.realtime.emitToUser(
          notification.recipientId,
          NOTIFICATION_CREATED_SOCKET_EVENT,
          toNotificationCreatedPayload(notification),
        );
      } catch (error) {
        this.logger.warn(
          `Không đẩy được realtime thông báo ${notification._id} tới ${notification.recipientId}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
    return Promise.resolve();
  }
}

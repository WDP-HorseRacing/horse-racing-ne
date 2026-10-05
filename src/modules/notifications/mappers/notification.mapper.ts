import type { Notification } from '../schemas/notification.schema';
import type { NotificationCreatedPayload } from '../types/notification.types';

/**
 * Dựng payload đẩy realtime (NOTIFICATION_CREATED_SOCKET_EVENT) cho một thông báo vừa lưu
 *
 * - Chỉ gửi các field client cần hiển thị, không gửi eventId hay recipientId
 *
 * @param notification Thông báo vừa lưu
 * @returns Payload gửi qua socket
 */
export function toNotificationCreatedPayload(
  notification: Notification,
): NotificationCreatedPayload {
  return {
    id: notification._id,
    type: notification.type,
    priority: notification.priority,
    title: notification.title,
    message: notification.message,
    resource: notification.resource
      ? { type: notification.resource.type, id: notification.resource.id }
      : null,
    createdAt: notification.createdAt,
  };
}

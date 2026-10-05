import type { NotificationResponseDto } from '../dto/notification.dto';
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
    resource: toResource(notification),
    createdAt: notification.createdAt,
  };
}

/**
 * Chuyển một thông báo đã lưu sang DTO trả cho người nhận
 *
 * - Không trả eventId hay recipientId
 *
 * @param notification Thông báo đã lưu
 * @returns NotificationResponseDto - Thông báo kèm trạng thái đã đọc
 */
export function toNotificationResponse(
  notification: Notification,
): NotificationResponseDto {
  return {
    id: notification._id,
    type: notification.type,
    priority: notification.priority,
    title: notification.title,
    message: notification.message,
    resource: toResource(notification),
    readAt: notification.readAt,
    createdAt: notification.createdAt,
  };
}

/**
 * Chép resource của thông báo thành object thường (bỏ dữ liệu nội bộ của Mongoose)
 *
 * @param notification Thông báo đã lưu
 * @returns Resource, hoặc null nếu thông báo không trỏ tới đối tượng nào
 */
function toResource(
  notification: Notification,
): NotificationCreatedPayload['resource'] {
  return notification.resource
    ? { type: notification.resource.type, id: notification.resource.id }
    : null;
}

import type { MulticastMessage } from 'firebase-admin/messaging';
import { encodeKeysetCursor } from '../../../common/utils/keyset-cursor';
import type {
  NotificationPageResponseDto,
  NotificationResponseDto,
} from '../dto/notification.dto';
import { NotificationPriority } from '../enums/notification-priority.enum';
import { NotificationResourceType } from '../enums/notification-resource-type.enum';
import type {
  NotificationRecord,
  NotificationResource,
} from '../schemas/notification.schema';
import type { NotificationCreatedPayload } from '../types/notification.types';

/**
 * Dựng resource trỏ tới hồ sơ ngựa
 *
 * @param horseId UUID của ngựa
 * @returns Resource loại HORSE
 */
export function horseResource(horseId: string): NotificationResource {
  return { type: NotificationResourceType.HORSE, id: horseId };
}

/**
 * Dựng payload đẩy realtime (NOTIFICATION_CREATED_SOCKET_EVENT) cho một thông báo vừa lưu
 *
 * - Chỉ gửi các field client cần hiển thị, không gửi eventId hay recipientId
 *
 * @param notification Thông báo vừa lưu
 * @returns Payload gửi qua socket
 */
export function toNotificationCreatedPayload(
  notification: NotificationRecord,
): NotificationCreatedPayload {
  return {
    id: notification._id,
    category: notification.category,
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
  notification: NotificationRecord,
): NotificationResponseDto {
  return {
    ...toNotificationCreatedPayload(notification),
    readAt: notification.readAt,
  };
}

/**
 * Dựng một trang thông báo từ các dòng đọc dư một phần tử
 *
 * - rows có nhiều hơn limit phần tử: còn trang sau, nextCursor là vị trí phần tử cuối của trang
 * - Ngược lại: nextCursor là null
 *
 * @param rows Các thông báo đọc được, tối đa limit + 1 phần tử, mới nhất trước
 * @param limit Số phần tử của một trang
 * @returns NotificationPageResponseDto - Các thông báo của trang và nextCursor
 */
export function toNotificationPage(
  rows: NotificationRecord[],
  limit: number,
): NotificationPageResponseDto {
  const items = rows.slice(0, limit);
  const last = items[items.length - 1];
  return {
    items: items.map(toNotificationResponse),
    nextCursor:
      rows.length > limit
        ? encodeKeysetCursor({ createdAt: last.createdAt, id: last._id })
        : null,
  };
}

/**
 * Dựng tin nhắn push gửi một thông báo tới nhiều thiết bị
 *
 * - notification: tiêu đề và nội dung để hệ điều hành hiển thị khi app chạy nền
 * - data: id, category, priority và resourceType/resourceId (nếu có); mọi giá trị là chuỗi
 * - Thông báo HIGH, URGENT gửi với ưu tiên cao trên Android và APNs
 *
 * @param notification Thông báo đã lưu
 * @param tokens FCM registration token của các thiết bị nhận
 * @returns Tin nhắn multicast cho Firebase Messaging
 */
export function toPushMessage(
  notification: NotificationRecord,
  tokens: string[],
): MulticastMessage {
  const important = notification.priority !== NotificationPriority.NORMAL;
  return {
    tokens,
    notification: { title: notification.title, body: notification.message },
    data: {
      id: notification._id,
      category: notification.category,
      priority: notification.priority,
      ...(notification.resource
        ? {
            resourceType: notification.resource.type,
            resourceId: notification.resource.id,
          }
        : {}),
    },
    android: { priority: important ? 'high' : 'normal' },
    apns: { headers: { 'apns-priority': important ? '10' : '5' } },
  };
}

/**
 * Chép resource của thông báo thành object thường (bỏ dữ liệu nội bộ của Mongoose)
 *
 * @param notification Thông báo đã lưu
 * @returns Resource, hoặc null nếu thông báo không trỏ tới đối tượng nào
 */
function toResource(
  notification: NotificationRecord,
): NotificationResource | null {
  return notification.resource
    ? { type: notification.resource.type, id: notification.resource.id }
    : null;
}

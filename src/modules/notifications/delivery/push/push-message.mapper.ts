import type { MulticastMessage } from 'firebase-admin/messaging';
import { NotificationPriority } from '../../constants/notification-priority.enum';
import type { Notification } from '../../schemas/notification.schema';

/**
 * Dựng tin nhắn FCM gửi một thông báo tới nhiều thiết bị
 *
 * - notification: tiêu đề và nội dung để hệ điều hành hiển thị khi app chạy nền
 * - data: notificationId, priority và resourceType/resourceId (nếu có) để app mở đúng màn hình; mọi giá trị là chuỗi
 * - Thông báo HIGH, URGENT gửi với ưu tiên cao trên Android và APNs
 *
 * @param notification Thông báo đã lưu
 * @param tokens FCM registration token của các thiết bị nhận
 * @returns Tin nhắn multicast cho Firebase Messaging
 */
export function toPushMessage(
  notification: Notification,
  tokens: string[],
): MulticastMessage {
  const important = notification.priority !== NotificationPriority.NORMAL;
  return {
    tokens,
    notification: { title: notification.title, body: notification.message },
    data: {
      notificationId: notification._id,
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

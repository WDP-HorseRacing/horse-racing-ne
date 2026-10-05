/**
 * Dữ liệu một việc gửi push FCM trong hàng đợi NOTIFICATION_PUSH_QUEUE.
 *
 * - tokens: chỉ có khi gửi lại; là các token lần trước gặp lỗi tạm thời. Không có thì gửi tới mọi thiết bị của người nhận
 */
export interface NotificationPushJob {
  notificationId: string;
  tokens?: string[];
}

/**
 * Tên sự kiện socket đẩy tới room `user:<id>` khi người dùng có thông báo mới.
 */
export const NOTIFICATION_CREATED_SOCKET_EVENT = 'notification.created';

/**
 * Tên hàng đợi BullMQ chứa việc gửi push FCM cho từng thông báo.
 */
export const NOTIFICATION_PUSH_QUEUE = 'notification-push';

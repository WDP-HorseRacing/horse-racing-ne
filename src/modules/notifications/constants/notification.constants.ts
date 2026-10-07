/**
 * Tên sự kiện socket đẩy tới room `user:<id>` khi người dùng có thông báo mới.
 */
export const NOTIFICATION_CREATED_SOCKET_EVENT = 'notification.created';

/**
 * Tên sự kiện socket đẩy tới room `user:<id>` khi người dùng đánh dấu một thông báo là đã đọc.
 */
export const NOTIFICATION_READ_SOCKET_EVENT = 'notification.read';

/**
 * Tên sự kiện socket đẩy tới room `user:<id>` khi người dùng đánh dấu mọi thông báo là đã đọc.
 */
export const NOTIFICATION_ALL_READ_SOCKET_EVENT = 'notification.all-read';

/**
 * Tên hàng đợi BullMQ chứa việc gửi push cho từng thông báo.
 */
export const NOTIFICATION_PUSH_QUEUE = 'notification-push';

/**
 * Tên job gửi push trong NOTIFICATION_PUSH_QUEUE.
 */
export const NOTIFICATION_PUSH_JOB = 'push';

/**
 * Token inject danh sách kênh giao thông báo (NotificationChannel[]).
 */
export const NOTIFICATION_CHANNELS = Symbol('NOTIFICATION_CHANNELS');

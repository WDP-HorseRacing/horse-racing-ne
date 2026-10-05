import type { Notification } from '../../schemas/notification.schema';

/**
 * Token inject danh sách kênh giao thông báo (NotificationChannel[]).
 */
export const NOTIFICATION_CHANNELS = Symbol('NOTIFICATION_CHANNELS');

/**
 * Một kênh giao thông báo đã lưu tới người nhận (socket, push mobile...).
 */
export interface NotificationChannel {
  /**
   * Giao các thông báo vừa lưu tới người nhận của từng thông báo
   *
   * @param notifications Các thông báo vừa được lưu mới
   * @returns Promise hoàn tất khi kênh đã giao xong hoặc đã chuyển cho hàng đợi
   */
  deliver(notifications: Notification[]): Promise<void>;
}

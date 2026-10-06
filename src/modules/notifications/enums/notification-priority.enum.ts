/**
 * Mức ưu tiên của một thông báo.
 *
 * - NORMAL: thông tin thường (vd ngựa mới vào khu)
 * - HIGH: cảnh báo cần xử lý sớm (vd giảm cân bất thường)
 * - URGENT: thông báo khẩn (vd ngựa sốt)
 */
export enum NotificationPriority {
  NORMAL = 'NORMAL',
  HIGH = 'HIGH',
  URGENT = 'URGENT',
}

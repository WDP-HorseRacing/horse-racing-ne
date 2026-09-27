/**
 * Trạng thái hạn khám định kỳ (F3.2 mục 2), tính theo số ngày còn lại tới hạn khám.
 *
 * - OK: còn trên 3 ngày
 * - DUE_SOON: còn từ 0 đến 3 ngày
 * - OVERDUE: đã qua hạn
 */
export enum CheckupDueStatus {
  OK = 'OK',
  DUE_SOON = 'DUE_SOON',
  OVERDUE = 'OVERDUE',
}

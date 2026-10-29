/**
 * Trạng thái hạn khám định kỳ, tính theo số ngày còn lại tới hạn khám.
 *
 * - OK: còn trên CHECKUP_DUE_SOON_DAYS ngày
 * - DUE_SOON: còn từ 0 đến CHECKUP_DUE_SOON_DAYS ngày
 * - OVERDUE: đã qua hạn
 */
export enum CheckupDueStatus {
  OK = 'OK',
  DUE_SOON = 'DUE_SOON',
  OVERDUE = 'OVERDUE',
}

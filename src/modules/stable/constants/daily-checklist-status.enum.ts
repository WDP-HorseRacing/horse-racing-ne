/**
 * Trạng thái checklist hằng ngày của một con ngựa
 *
 * - PENDING: chưa việc nào xong
 * - IN_PROGRESS: xong một phần
 * - COMPLETED: xong hết
 * - INCOMPLETE: ngày đã qua mà chưa xong; checklist bị khóa
 */
export enum DailyChecklistStatus {
  PENDING = 'PENDING',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  INCOMPLETE = 'INCOMPLETE',
}

/**
 * Các trạng thái của checklist còn mở, cron cuối ngày chuyển sang INCOMPLETE
 */
export const OPEN_CHECKLIST_STATUSES = [
  DailyChecklistStatus.PENDING,
  DailyChecklistStatus.IN_PROGRESS,
] as const;

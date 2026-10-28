/**
 * Hai việc checklist chạy lúc 00:05, lỗi việc nào thì chỉ việc đó thử lại
 *
 * - CLOSE_PAST_DAYS: đóng checklist của các ngày đã qua
 * - GENERATE_TODAY: sinh checklist hôm nay cho ngựa còn thiếu
 */
export enum ChecklistJob {
  CLOSE_PAST_DAYS = 'close-past-days',
  GENERATE_TODAY = 'generate-today',
}

/**
 * Tên hẹn thử lại của một việc checklist trong SchedulerRegistry
 *
 * @param job Việc checklist
 * @returns Tên hẹn
 */
export function checklistRetryName(job: ChecklistJob): string {
  return `daily-checklists-retry:${job}`;
}

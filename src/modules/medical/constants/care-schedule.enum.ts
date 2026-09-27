export enum CareScheduleType {
  VACCINATION = 'VACCINATION',
  DEWORMING = 'DEWORMING',
  FARRIER = 'FARRIER',
  ROUTINE_CHECKUP = 'ROUTINE_CHECKUP',
}

/**
 * Trạng thái lịch chăm sóc (F3.11 mục 2): COMPLETED và CANCELLED là trạng thái cuối.
 */
export enum CareScheduleStatus {
  SCHEDULED = 'SCHEDULED',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

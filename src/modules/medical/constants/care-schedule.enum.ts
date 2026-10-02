export enum CareScheduleType {
  VACCINATION = 'VACCINATION',
  DEWORMING = 'DEWORMING',
  FARRIER = 'FARRIER',
  ROUTINE_CHECKUP = 'ROUTINE_CHECKUP',
}

/**
 * Trạng thái lịch chăm sóc: COMPLETED và CANCELLED là trạng thái cuối.
 */
export enum CareScheduleStatus {
  SCHEDULED = 'SCHEDULED',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

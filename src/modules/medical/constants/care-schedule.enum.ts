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

/**
 * Vai trò được giao làm lịch chăm sóc
 *
 * - GROOM: assigned_to null là Groom đang phụ trách ngựa; có assigned_to là đúng Groom đó
 * - VET: assigned_to bắt buộc, là đúng bác sĩ đó
 */
export enum CareAssigneeType {
  GROOM = 'GROOM',
  VET = 'VET',
}

export enum CareScheduleType {
  VACCINATION = 'VACCINATION',
  DEWORMING = 'DEWORMING',
  FARRIER = 'FARRIER',
  ROUTINE_CHECKUP = 'ROUTINE_CHECKUP',
  FOLLOW_UP = 'FOLLOW_UP',
}

/**
 * Loại lịch là ngày hẹn bác sĩ khám (khám định kỳ, tái khám trong bệnh án)
 *
 * - Không giao ai, không hoàn tất hay hủy qua route lịch chăm sóc
 * - Tự hoàn tất khi có buổi khám tương ứng
 */
export const VET_APPOINTMENT_TYPES: readonly CareScheduleType[] = [
  CareScheduleType.ROUTINE_CHECKUP,
  CareScheduleType.FOLLOW_UP,
];

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

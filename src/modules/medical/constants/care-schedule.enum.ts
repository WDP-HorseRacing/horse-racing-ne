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
 * Trạng thái lịch chăm sóc: CANCELLED là trạng thái cuối; COMPLETED mở lại được về SCHEDULED.
 */
export enum CareScheduleStatus {
  SCHEDULED = 'SCHEDULED',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

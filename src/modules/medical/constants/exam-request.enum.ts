/**
 * Trạng thái yêu cầu khám: EXAMINED và DISMISSED là trạng thái cuối, không mở lại.
 */
export enum ExamRequestStatus {
  PENDING = 'PENDING',
  EXAMINED = 'EXAMINED',
  DISMISSED = 'DISMISSED',
}

/**
 * Nguồn gốc yêu cầu khám.
 *
 * - GROOM_INCIDENT: báo cáo sự cố của Groom
 * - MEASUREMENT_ALERT: cảnh báo tự động từ chỉ số cơ thể
 * - STAFF: Head Trainer hoặc Club Manager gửi tay
 * - VET: bác sĩ tự tạo
 */
export enum ExamRequestSource {
  GROOM_INCIDENT = 'GROOM_INCIDENT',
  MEASUREMENT_ALERT = 'MEASUREMENT_ALERT',
  STAFF = 'STAFF',
  VET = 'VET',
}

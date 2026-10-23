/**
 * Cách một sự cố được đóng
 *
 * - HEAD_TRAINER: Head Trainer của khu đóng tay kèm kết quả xử lý
 * - EXAM: tự đóng khi bác sĩ khám xong hoặc bỏ qua yêu cầu khám của sự cố
 * - LIFECYCLE: tự đóng khi ngựa chuyển nhượng hoặc ghi nhận đã mất
 */
export enum IncidentResolutionSource {
  HEAD_TRAINER = 'HEAD_TRAINER',
  EXAM = 'EXAM',
  LIFECYCLE = 'LIFECYCLE',
}

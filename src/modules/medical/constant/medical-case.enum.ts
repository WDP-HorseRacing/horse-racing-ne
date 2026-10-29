/**
 * Trạng thái bệnh án.
 *
 * - OPEN: đang điều trị
 * - CLOSED: đã đóng, có kết luận cuối và chi phí
 * - CANCELLED: mở nhầm, bị hủy khi hủy buổi khám mở bệnh án lúc chưa có buổi nào khác; không có chi phí
 */
export enum MedicalCaseStatus {
  OPEN = 'OPEN',
  CLOSED = 'CLOSED',
  CANCELLED = 'CANCELLED',
}

/**
 * Việc cần làm khi hủy một buổi khám.
 *
 * - VOID: chỉ hủy buổi khám
 * - VOID_AND_CANCEL_CASE: hủy buổi mở bệnh án và hủy luôn bệnh án mở nhầm
 */
export enum VisitVoidAction {
  VOID = 'VOID',
  VOID_AND_CANCEL_CASE = 'VOID_AND_CANCEL_CASE',
}

/**
 * Cách xử lý lệnh khóa huấn luyện gắn với bệnh án khi đóng bệnh án.
 *
 * - RELEASE: gỡ khóa ngay
 * - KEEP: giữ khóa, bắt buộc kèm ngày dự kiến gỡ
 */
export enum CaseLockDecision {
  RELEASE = 'RELEASE',
  KEEP = 'KEEP',
}

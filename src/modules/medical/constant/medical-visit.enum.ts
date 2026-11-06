/**
 * Loại buổi khám.
 *
 * - ROUTINE: khám định kỳ ngoài bệnh án
 * - REQUEST: khám theo yêu cầu ngoài bệnh án
 * - FOLLOW_UP: tái khám trong bệnh án đang mở
 */
export enum MedicalVisitKind {
  ROUTINE = 'ROUTINE',
  REQUEST = 'REQUEST',
  FOLLOW_UP = 'FOLLOW_UP',
}

/**
 * Kết luận của buổi khám ngoài bệnh án: ISSUE bắt buộc mở bệnh án ngay trong lần lưu.
 */
export enum MedicalVisitConclusion {
  NORMAL = 'NORMAL',
  ISSUE = 'ISSUE',
}

/**
 * Trạng thái sức khỏe của ngựa sau khi hủy một buổi khám.
 *
 * - NOT_CHANGED_BY_VISIT: buổi khám không đổi sức khỏe, không có gì để hoàn
 * - UNKNOWN_BEFORE: buổi khám ghi trước khi lưu sức khỏe trước khám, giữ nguyên sức khỏe hiện tại
 * - REVERTED: sức khỏe ngựa về giá trị ngay trước buổi khám
 * - KEPT_LATER_CHANGE: sau buổi khám đã có lần đổi sức khỏe khác, giữ nguyên sức khỏe hiện tại
 */
export enum VisitVoidHealthOutcome {
  NOT_CHANGED_BY_VISIT = 'NOT_CHANGED_BY_VISIT',
  UNKNOWN_BEFORE = 'UNKNOWN_BEFORE',
  REVERTED = 'REVERTED',
  KEPT_LATER_CHANGE = 'KEPT_LATER_CHANGE',
}

/**
 * Trạng thái sức khỏe của ngựa sau khi sửa một buổi khám.
 *
 * - UNCHANGED: lần sửa không đổi trạng thái sức khỏe sau khám của buổi khám
 * - UPDATED: buổi khám và sức khỏe hiện tại của ngựa cùng đổi theo giá trị mới
 * - KEPT_LATER_CHANGE: sau buổi khám đã có lần đổi sức khỏe khác, chỉ đổi kết quả ghi trên buổi khám, giữ nguyên sức khỏe hiện tại
 */
export enum VisitEditHealthOutcome {
  UNCHANGED = 'UNCHANGED',
  UPDATED = 'UPDATED',
  KEPT_LATER_CHANGE = 'KEPT_LATER_CHANGE',
}

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

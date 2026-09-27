/**
 * Loại buổi khám (Flow 3 mục III.1).
 *
 * - ROUTINE: khám định kỳ ngoài bệnh án (F3.3)
 * - REQUEST: khám theo yêu cầu ngoài bệnh án (F3.3)
 * - FOLLOW_UP: tái khám trong bệnh án đang mở (F3.6)
 */
export enum MedicalVisitKind {
  ROUTINE = 'ROUTINE',
  REQUEST = 'REQUEST',
  FOLLOW_UP = 'FOLLOW_UP',
}

/**
 * Kết luận của buổi khám ngoài bệnh án: ISSUE bắt buộc mở bệnh án ngay trong lần lưu (F3.3 mục 3).
 */
export enum MedicalVisitConclusion {
  NORMAL = 'NORMAL',
  ISSUE = 'ISSUE',
}

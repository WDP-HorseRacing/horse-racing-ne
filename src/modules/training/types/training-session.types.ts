/**
 * Khoảng giờ của một buổi tập, tính từ giờ bắt đầu tới trước giờ kết thúc.
 */
export interface SessionWindow {
  scheduledStartAt: Date;
  scheduledEndAt: Date;
}

/**
 * Buổi tập ngựa đang giữ chỗ, kèm mã lớp của buổi.
 */
export interface HorseSessionHolding extends SessionWindow {
  sessionId: string;
  classCode: string;
}

/**
 * Ngựa không được tạo lượt khi publish buổi vì trùng giờ với buổi ở lớp khác.
 */
export interface SkippedHorse {
  horseId: string;
  horseName: string;
  conflictClassCode: string;
  conflictStartAt: Date;
}

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

/**
 * Tên và mã ảnh đại diện của ngựa để hiện trên danh sách.
 */
export interface HorseBrief {
  name: string;
  mediaId: string | null;
}

/**
 * Tên và ảnh ngựa (link có hạn) để hiện trên một dòng danh sách.
 */
export interface HorseListDisplay {
  horseName: string;
  horsePhotoUrl: string | null;
}

/**
 * Thông tin hiển thị của một lượt tập: ngựa và Groom được giao.
 */
export interface ParticipantListDisplay extends HorseListDisplay {
  assignedGroomName: string | null;
}

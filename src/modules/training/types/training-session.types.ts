import type { SessionParticipantStatus } from '../enums/session-participant-status.enum';
import type { TrainingIntensity } from '../enums/training-intensity.enum';

/**
 * Khoảng giờ của một buổi tập, tính từ giờ bắt đầu tới trước giờ kết thúc.
 */
export interface SessionWindow {
  scheduledStartAt: Date;
  scheduledEndAt: Date;
}

/**
 * Buổi tập kèm mã lớp và cường độ, dùng để xét giới hạn tập trong ngày.
 */
export interface ClassSessionLoad extends SessionWindow {
  sessionId: string;
  classCode: string;
  intensity: TrainingIntensity;
}

/**
 * Buổi tập của một ngựa ở một lớp, kèm mã lớp và cường độ của buổi.
 */
export interface HorseClassSession extends ClassSessionLoad {
  horseId: string;
}

/**
 * Buổi tập ngựa đang giữ chỗ, kèm mã lớp của buổi.
 */
export type HorseSessionHolding = HorseClassSession;

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

/**
 * Trạng thái và lý do không đủ điều kiện của một lượt tập.
 */
export interface ParticipantEligibilityState {
  status: SessionParticipantStatus;
  ineligibilityReason: string | null;
}

/**
 * Lượt tập vừa đổi trạng thái hoặc lý do khi hệ thống chấm lại điều kiện tập.
 */
export interface ParticipantEligibilityChange {
  participantId: string;
  before: ParticipantEligibilityState;
  after: ParticipantEligibilityState;
}

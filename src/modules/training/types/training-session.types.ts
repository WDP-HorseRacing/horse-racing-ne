import type { SessionParticipantStatus } from '../enums/session-participant-status.enum';
import type { TrainingIntensity } from '../enums/training-intensity.enum';
import type { TrainingSessionStatus } from '../enums/training-session-status.enum';

/**
 * Khoảng giờ của một buổi tập, tính từ giờ bắt đầu tới trước giờ kết thúc.
 */
export interface SessionWindow {
  scheduledStartAt: Date;
  scheduledEndAt: Date;
}

/**
 * Lượt tập có người dắt, kèm giờ và trạng thái buổi, dùng để xét Groom dắt hai lượt trùng giờ.
 */
export interface GroomRun extends SessionWindow {
  sessionId: string;
  status: SessionParticipantStatus;
  sessionStatus: TrainingSessionStatus;
  sessionName: string;
  horseName: string;
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
 * Buổi tập của một lớp kèm Head Trainer phụ trách lớp, dùng để xét Head Trainer phụ trách hai buổi trùng giờ.
 */
export interface HeadTrainerSession extends SessionWindow {
  sessionId: string;
  classId: string;
  classCode: string;
  headTrainerId: string;
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

/**
 * Payload của domain event TRAINING_SESSION_CANCELLED_EVENT
 *
 * - eventId: sinh mới mỗi lần hủy, dùng để chống gửi trùng thông báo
 * - scheduledStartAt: giờ bắt đầu dự kiến, chuỗi ISO
 * - runs: các lượt vừa bị hủy; groomId là người dắt được giao, null nếu lượt chưa có người dắt
 */
export interface TrainingSessionCancelledEvent {
  eventId: string;
  sessionId: string;
  sessionName: string;
  scheduledStartAt: string;
  reason: string;
  runs: Array<{ horseId: string; groomId: string | null }>;
}

/**
 * Payload của domain event TRAINING_RUN_GROOM_ASSIGNED_EVENT
 *
 * - eventId: sinh mới mỗi lần giao, dùng để chống gửi trùng thông báo
 * - groomId: Groom vừa được giao dắt lượt
 * - scheduledStartAt: giờ bắt đầu dự kiến của buổi, chuỗi ISO
 * - location, surface: địa điểm và mặt sân của buổi, null nếu buổi chưa ghi
 */
export interface TrainingRunGroomAssignedEvent {
  eventId: string;
  participantId: string;
  groomId: string;
  horseId: string;
  horseName: string;
  sessionId: string;
  sessionName: string;
  scheduledStartAt: string;
  location: string | null;
  surface: string | null;
}

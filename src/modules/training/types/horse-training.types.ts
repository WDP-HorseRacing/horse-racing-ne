import type { HorseEnrollmentStatus } from '../enums/horse-enrollment-status.enum';
import type { HorseTrainingSessionWhen } from '../enums/horse-training-session-when.enum';
import type { SessionParticipantStatus } from '../enums/session-participant-status.enum';
import type { TrainingClassStatus } from '../enums/training-class-status.enum';
import type { TrainingSessionStatus } from '../enums/training-session-status.enum';
import type { TrainingSessionType } from '../enums/training-session-type.enum';

/**
 * Một lần ngựa vào lớp, kèm thông tin lớp.
 */
export interface HorseTrainingClassRow {
  enrollmentId: string;
  classId: string;
  code: string;
  name: string;
  classStatus: TrainingClassStatus;
  headTrainerName: string | null;
  enrollmentStatus: HorseEnrollmentStatus;
  enrolledAt: Date;
  leftAt: Date | null;
}

/**
 * Một lượt ngựa dự buổi tập, kèm thông tin buổi, giáo án và lớp.
 */
export interface HorseTrainingSessionRow {
  participantId: string;
  sessionId: string;
  classId: string;
  className: string;
  planName: string;
  subjectName: string | null;
  name: string;
  sessionType: TrainingSessionType;
  scheduledStartAt: Date;
  scheduledEndAt: Date;
  location: string | null;
  surface: string | null;
  sessionStatus: TrainingSessionStatus;
  participantStatus: SessionParticipantStatus;
  groomName: string | null;
  absenceReason: string | null;
  cancelReason: string | null;
  completedAt: Date | null;
}

/**
 * Một lần chạy time trial của ngựa, gắn với lượt tham gia của nó.
 */
export interface HorseTrainingTrialRow {
  participantId: string;
  attemptNo: number;
  elapsedMs: string;
  notes: string | null;
  videoMediaId: string | null;
  recordedAt: Date;
}

/**
 * Đánh giá của một lượt tập, gắn với lượt tham gia của nó.
 */
export interface HorseTrainingEvaluationRow {
  participantId: string;
  score: number;
  comment: string | null;
  evaluatorName: string | null;
  createdAt: Date;
}

/**
 * Bộ lọc khi đọc lịch buổi tập của một con ngựa.
 */
export interface HorseTrainingSessionFilter {
  /** Chỉ lấy buổi của lớp này, bỏ trống là mọi lớp */
  classId?: string;
  /** Buổi chưa bắt đầu hoặc đã bắt đầu so với `now`; bỏ trống là tất cả */
  when?: HorseTrainingSessionWhen;
  /** Mốc thời gian để chia upcoming/history */
  now: Date;
  /** Số dòng bỏ qua */
  skip: number;
  /** Số dòng tối đa */
  limit: number;
}

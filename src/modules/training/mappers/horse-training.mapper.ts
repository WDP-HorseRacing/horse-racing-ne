import type {
  HorseTrainingClassResponseDto,
  HorseTrainingSessionResponseDto,
  HorseTrainingTrialResultDto,
} from '../dto/horse-training.dto';
import type {
  HorseTrainingClassRow,
  HorseTrainingEvaluationRow,
  HorseTrainingSessionRow,
  HorseTrainingTrialRow,
} from '../types/horse-training.types';

/**
 * Chuyển một lần vào lớp sang dữ liệu trả về
 *
 * @param row Dòng đọc từ HorseTrainingRepository.listClasses
 * @returns Lớp của ngựa kèm trạng thái đang học hay đã rời
 */
export function toHorseTrainingClassResponse(
  row: HorseTrainingClassRow,
): HorseTrainingClassResponseDto {
  return {
    enrollmentId: row.enrollmentId,
    classId: row.classId,
    code: row.code,
    name: row.name,
    classStatus: row.classStatus,
    headTrainerName: row.headTrainerName,
    enrollmentStatus: row.enrollmentStatus,
    enrolledAt: row.enrolledAt,
    leftAt: row.leftAt,
  };
}

/**
 * Chuyển một lượt tập sang dữ liệu trả về, gắn kèm kết quả time trial và đánh giá của lượt đó
 *
 * - Nơi gọi chỉ truyền các lần chạy và đánh giá thuộc đúng lượt tập này
 * - Không có lần chạy thì trả mảng rỗng; không có đánh giá thì trả null
 *
 * @param row Dòng đọc từ HorseTrainingRepository.listSessions
 * @param trials Các lần chạy time trial của lượt tập, giữ nguyên thứ tự
 * @param evaluation Đánh giá của lượt tập, null nếu chưa có
 * @param videoUrls Link xem video theo UUID tệp; lần chạy không có video hoặc không có link thì videoUrl là null
 * @returns Buổi tập của ngựa kèm kết quả và đánh giá
 */
export function toHorseTrainingSessionResponse(
  row: HorseTrainingSessionRow,
  trials: HorseTrainingTrialRow[],
  evaluation: HorseTrainingEvaluationRow | null,
  videoUrls: ReadonlyMap<string, string>,
): HorseTrainingSessionResponseDto {
  const trialResults: HorseTrainingTrialResultDto[] = trials.map((trial) => ({
    attemptNo: trial.attemptNo,
    elapsedMs: trial.elapsedMs,
    notes: trial.notes,
    videoUrl: trial.videoMediaId
      ? (videoUrls.get(trial.videoMediaId) ?? null)
      : null,
    recordedAt: trial.recordedAt,
  }));
  return {
    participantId: row.participantId,
    sessionId: row.sessionId,
    classId: row.classId,
    className: row.className,
    planName: row.planName,
    subjectName: row.subjectName,
    name: row.name,
    sessionType: row.sessionType,
    scheduledStartAt: row.scheduledStartAt,
    scheduledEndAt: row.scheduledEndAt,
    location: row.location,
    surface: row.surface,
    sessionStatus: row.sessionStatus,
    participantStatus: row.participantStatus,
    groomName: row.groomName,
    absenceReason: row.absenceReason,
    cancelReason: row.cancelReason,
    completedAt: row.completedAt,
    trialResults,
    evaluation: evaluation
      ? {
          score: evaluation.score,
          comment: evaluation.comment,
          evaluatorName: evaluation.evaluatorName,
          createdAt: evaluation.createdAt,
        }
      : null,
  };
}

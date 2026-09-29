import type {
  HorseTrainingClassResponseDto,
  HorseTrainingSessionResponseDto,
  HorseTrainingTrialResultDto,
} from '../dto/horse-training.dto';
import type {
  HorseTrainingClassRow,
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
 * Chuyển một lượt tập sang dữ liệu trả về, gắn kèm kết quả time trial của lượt đó
 *
 * - Chỉ lấy các lần chạy thuộc đúng lượt tập này; không có thì trả mảng rỗng
 *
 * @param row Dòng đọc từ HorseTrainingRepository.listSessions
 * @param trials Kết quả time trial của cả trang, sẽ được lọc theo lượt tập
 * @returns Buổi tập của ngựa kèm kết quả
 */
export function toHorseTrainingSessionResponse(
  row: HorseTrainingSessionRow,
  trials: HorseTrainingTrialRow[],
): HorseTrainingSessionResponseDto {
  const trialResults: HorseTrainingTrialResultDto[] = trials
    .filter((trial) => trial.participantId === row.participantId)
    .map((trial) => ({
      attemptNo: trial.attemptNo,
      elapsedMs: trial.elapsedMs,
      notes: trial.notes,
      recordedAt: trial.recordedAt,
    }));
  return {
    participantId: row.participantId,
    sessionId: row.sessionId,
    classId: row.classId,
    className: row.className,
    planName: row.planName,
    phaseName: row.phaseName,
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
  };
}

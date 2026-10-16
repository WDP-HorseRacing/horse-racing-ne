import type { TimeTrialEntity } from '../entities/time-trial.entity';
import type { TrainingClassEntity } from '../entities/training-class.entity';
import type { TrainingSessionEntity } from '../entities/training-session.entity';
import type { TrainingSubjectEntity } from '../entities/training-subject.entity';

/**
 * Một giai đoạn của giáo án dùng cho nhật ký: số tuần và các môn kèm số buổi tối thiểu mỗi tuần
 */
interface PlanPhaseInput {
  weeks: number;
  subjects: Array<{ subjectId: string; minSessionsPerWeek: number }>;
}

/**
 * Lấy các field của môn học được ghi nhật ký
 *
 * @param subject Môn học
 * @returns Tên, mô tả, loại buổi, cường độ, cự ly, thời lượng, mặt sân, thời gian mục tiêu
 */
export function subjectAuditData(subject: TrainingSubjectEntity) {
  return {
    name: subject.name,
    description: subject.description,
    sessionType: subject.sessionType,
    intensity: subject.intensity,
    plannedDistanceM: subject.plannedDistanceM,
    durationMinutes: subject.durationMinutes,
    surface: subject.surface,
    targetTimeMs: subject.targetTimeMs,
  };
}

/**
 * Dựng nội dung giáo án để ghi nhật ký
 *
 * - Môn trong mỗi giai đoạn sắp theo subjectId để hai lần dựng cùng nội dung cho cùng kết quả
 *
 * @param name Tên giáo án
 * @param description Mô tả giáo án
 * @param phases Các giai đoạn theo thứ tự
 * @returns Tên, mô tả và các giai đoạn kèm số tuần, môn, số buổi tối thiểu mỗi tuần
 */
export function planAuditData(
  name: string,
  description: string | null,
  phases: PlanPhaseInput[],
) {
  return {
    name,
    description,
    phases: phases.map((phase) => ({
      weeks: phase.weeks,
      subjects: phase.subjects
        .map((item) => ({
          subjectId: item.subjectId,
          minSessionsPerWeek: item.minSessionsPerWeek,
        }))
        .sort((a, b) => a.subjectId.localeCompare(b.subjectId)),
    })),
  };
}

/**
 * Lấy các field của lớp học được ghi nhật ký khi tạo hoặc sửa
 *
 * @param row Lớp học
 * @returns Mã, tên, mô tả, năng khiếu đua, sĩ số tối đa, ngày bắt đầu, ngày kết thúc
 */
export function classAuditData(row: TrainingClassEntity) {
  return {
    code: row.code,
    name: row.name,
    description: row.description,
    raceAptitude: row.raceAptitude,
    maxHorses: row.maxHorses,
    startDate: row.startDate,
    endDate: row.endDate,
  };
}

/**
 * Lấy các field của buổi tập được ghi nhật ký khi tạo hoặc sửa
 *
 * - Giờ bắt đầu, kết thúc đổi sang chuỗi ISO
 *
 * @param session Buổi tập
 * @returns Môn, tên, loại buổi, cường độ, cự ly, giờ, địa điểm, mặt sân, ghi chú
 */
export function sessionAuditData(session: TrainingSessionEntity) {
  return {
    subjectId: session.subjectId,
    name: session.name,
    sessionType: session.sessionType,
    intensity: session.intensity,
    plannedDistanceM: session.plannedDistanceM,
    scheduledStartAt: session.scheduledStartAt.toISOString(),
    scheduledEndAt: session.scheduledEndAt.toISOString(),
    location: session.location,
    surface: session.surface,
    notes: session.notes,
  };
}

/**
 * Lấy các field của cấu hình chạy thử được ghi nhật ký, số đã đổi sang number
 *
 * @param trial Cấu hình chạy thử
 * @returns Cự ly, thời gian mục tiêu, ghi chú
 */
export function timeTrialAuditData(trial: TimeTrialEntity) {
  return {
    distanceM: Number(trial.distanceM),
    targetTimeMs:
      trial.targetTimeMs === null ? null : Number(trial.targetTimeMs),
    notes: trial.notes,
  };
}

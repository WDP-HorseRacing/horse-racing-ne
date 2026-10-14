import type { TrainingClassEntity } from '../entities/training-class.entity';
import type { TrainingSubjectEntity } from '../entities/training-subject.entity';

/**
 * Một giai đoạn của giáo án dùng cho nhật ký: số tuần và các môn kèm thứ trong tuần
 */
interface PlanPhaseInput {
  weeks: number;
  subjects: Array<{ subjectId: string; weekdays: number[] }>;
}

/**
 * Lấy các field của môn học được ghi nhật ký
 *
 * @param subject Môn học
 * @returns Tên, mô tả, loại buổi, cường độ, cự ly, mặt sân, thời gian mục tiêu
 */
export function subjectAuditData(subject: TrainingSubjectEntity) {
  return {
    name: subject.name,
    description: subject.description,
    sessionType: subject.sessionType,
    intensity: subject.intensity,
    plannedDistanceM: subject.plannedDistanceM,
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
 * @returns Tên, mô tả và các giai đoạn kèm số tuần, môn, thứ trong tuần
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
        .map((item) => ({ subjectId: item.subjectId, weekdays: item.weekdays }))
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

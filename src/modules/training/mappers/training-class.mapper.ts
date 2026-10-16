import { plainToInstance } from 'class-transformer';
import { shiftDays } from '../../../common/utils/club-date';
import {
  TrainingClassPlanResponseDto,
  TrainingClassResponseDto,
} from '../dto/training-class.dto';
import type { TrainingClassPhaseEntity } from '../entities/training-class-phase.entity';
import { TrainingClassEntity } from '../entities/training-class.entity';
import { phaseMinMinutes } from '../policies/training-plan.policy';
import { toTrainingSubjectResponse } from './training-subject.mapper';

const MAPPER_OPTIONS = { excludeExtraneousValues: true } as const;

export function toTrainingClassResponse(
  row: TrainingClassEntity,
): TrainingClassResponseDto {
  return plainToInstance(TrainingClassResponseDto, row, MAPPER_OPTIONS);
}

/**
 * Chuyển bản chép giáo án của lớp sang response DTO, tính khoảng ngày và thời lượng tối thiểu của từng giai đoạn
 *
 * - Giai đoạn sắp theo `position`, nối tiếp nhau từ ngày bắt đầu của lớp, mỗi tuần 7 ngày
 * - Môn trong giai đoạn sắp theo tên môn
 *
 * @param row Lớp học
 * @param phases Các giai đoạn của lớp đã tải kèm subjects và subjects.subject
 * @returns Giáo án của lớp để trả ra API
 */
export function toTrainingClassPlanResponse(
  row: TrainingClassEntity,
  phases: TrainingClassPhaseEntity[],
): TrainingClassPlanResponseDto {
  let nextStart = row.startDate;
  const mapped = [...phases]
    .sort((a, b) => a.position - b.position)
    .map((phase) => {
      const startDate = nextStart;
      nextStart = shiftDays(startDate, phase.weeks * 7);
      return {
        position: phase.position,
        weeks: phase.weeks,
        startDate,
        endDate: shiftDays(nextStart, -1),
        minTotalMinutes: phaseMinMinutes(phase),
        subjects: [...phase.subjects]
          .sort((a, b) => a.subject.name.localeCompare(b.subject.name))
          .map((item) => ({
            subject: toTrainingSubjectResponse(item.subject),
            minSessionsPerWeek: item.minSessionsPerWeek,
          })),
      };
    });
  return {
    classId: row.id,
    planId: row.planId,
    minTotalMinutes: mapped.reduce((sum, p) => sum + p.minTotalMinutes, 0),
    phases: mapped,
  };
}

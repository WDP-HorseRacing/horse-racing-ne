import { TrainingPlanResponseDto } from '../dto/training-plan.dto';
import { TrainingPlanEntity } from '../entities/training-plan.entity';
import { phaseMinMinutes } from '../policies/training-plan.policy';
import { totalPlanWeeks } from '../policies/training.policy';
import { toTrainingSubjectResponse } from './training-subject.mapper';

/**
 * Chuyển giáo án kèm các giai đoạn sang response DTO, tính tuần bắt đầu và thời lượng tối thiểu của từng giai đoạn
 *
 * - Giai đoạn sắp theo `position`; môn trong giai đoạn sắp theo tên môn
 *
 * @param plan Giáo án đã tải kèm phases, phases.subjects và phases.subjects.subject
 * @returns Giáo án để trả ra API
 */
export function toTrainingPlanResponse(
  plan: TrainingPlanEntity,
): TrainingPlanResponseDto {
  const phases = [...plan.phases].sort((a, b) => a.position - b.position);
  let nextWeek = 1;
  const mapped = phases.map((phase) => {
    const startWeek = nextWeek;
    nextWeek += phase.weeks;
    return {
      position: phase.position,
      startWeek,
      weeks: phase.weeks,
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
    id: plan.id,
    name: plan.name,
    description: plan.description,
    headTrainerId: plan.headTrainerId,
    totalWeeks: totalPlanWeeks(phases),
    minTotalMinutes: mapped.reduce((sum, p) => sum + p.minTotalMinutes, 0),
    phases: mapped,
    updatedAt: plan.updatedAt,
  };
}

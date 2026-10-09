import { TrainingPlanResponseDto } from '../dto/training-plan.dto';
import { TrainingPlanEntity } from '../entities/training-plan.entity';
import { totalPlanWeeks } from '../policies/training.policy';
import { toTrainingSubjectResponse } from './training-subject.mapper';

/**
 * Chuyển giáo án kèm các giai đoạn sang response DTO, tính tuần bắt đầu của từng giai đoạn
 *
 * - Giai đoạn sắp theo `position`
 * - Thứ trong tuần của mỗi môn sắp tăng; môn trong giai đoạn sắp theo thứ nhỏ nhất
 *
 * @param plan Giáo án đã tải kèm phases, phases.subjects và phases.subjects.subject
 * @returns Giáo án để trả ra API
 */
export function toTrainingPlanResponse(
  plan: TrainingPlanEntity,
): TrainingPlanResponseDto {
  const phases = [...plan.phases].sort((a, b) => a.position - b.position);
  let nextWeek = 1;
  return {
    id: plan.id,
    name: plan.name,
    description: plan.description,
    headTrainerId: plan.headTrainerId,
    totalWeeks: totalPlanWeeks(phases),
    phases: phases.map((phase) => {
      const startWeek = nextWeek;
      nextWeek += phase.weeks;
      return {
        position: phase.position,
        startWeek,
        weeks: phase.weeks,
        subjects: phase.subjects
          .map((item) => ({
            subject: toTrainingSubjectResponse(item.subject),
            weekdays: [...item.weekdays].sort((a, b) => a - b),
          }))
          .sort((a, b) => a.weekdays[0] - b.weekdays[0]),
      };
    }),
    updatedAt: plan.updatedAt,
  };
}

import { TrainingPlanResponseDto } from '../dto/training-plan.dto';
import { TrainingPlanEntity } from '../entities/training-plan.entity';
import { totalPlanWeeks } from '../policies/training.policy';
import { toTrainingSubjectResponse } from './training-subject.mapper';

/**
 * Chuyển giáo án kèm các môn sang response DTO, tính tuần bắt đầu của từng môn
 *
 * @param plan Giáo án đã tải kèm subjects và subjects.subject
 * @returns Giáo án để trả ra API, môn sắp theo thứ tự
 */
export function toTrainingPlanResponse(
  plan: TrainingPlanEntity,
): TrainingPlanResponseDto {
  const items = [...plan.subjects].sort((a, b) => a.position - b.position);
  let nextWeek = 1;
  return {
    id: plan.id,
    name: plan.name,
    description: plan.description,
    headTrainerId: plan.headTrainerId,
    totalWeeks: totalPlanWeeks(items),
    subjects: items.map((item) => {
      const startWeek = nextWeek;
      nextWeek += item.weeks;
      return {
        position: item.position,
        startWeek,
        weeks: item.weeks,
        subject: toTrainingSubjectResponse(item.subject),
      };
    }),
    updatedAt: plan.updatedAt,
  };
}

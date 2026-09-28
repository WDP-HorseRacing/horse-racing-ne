import { plainToInstance } from 'class-transformer';
import { TrainingPlanResponseDto } from '../dto/training-plan.dto';
import { TrainingPlanEntity } from '../entities/training-plan.entity';

const MAPPER_OPTIONS = { excludeExtraneousValues: true } as const;

export function toTrainingPlanResponse(
  plan: TrainingPlanEntity,
): TrainingPlanResponseDto {
  return plainToInstance(TrainingPlanResponseDto, plan, MAPPER_OPTIONS);
}

export function toTrainingPlanView(
  plan: TrainingPlanEntity,
  includeGoal: boolean,
): TrainingPlanResponseDto {
  const response = toTrainingPlanResponse(plan);
  if (!includeGoal) delete response.goal;
  return response;
}

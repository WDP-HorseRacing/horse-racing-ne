import { plainToInstance } from 'class-transformer';
import { PerformanceEvaluationEntity } from '../../performance/entities/performance-evaluation.entity';
import { TimeTrialEntity } from '../entities/time-trial.entity';
import { TrainingPlanEntity } from '../entities/training-plan.entity';
import { TrainingSessionEntity } from '../entities/training-session.entity';
import {
  SessionEvaluationResponseDto,
  TimeTrialResponseDto,
  TrainingPlanResponseDto,
  TrainingSessionResponseDto,
} from '../dto';

// config for class-transformer to exclude extraneous values
const MAPPER_OPTIONS = { excludeExtraneousValues: true } as const;

export function toTrainingPlanResponse(
  plan: TrainingPlanEntity,
): TrainingPlanResponseDto {
  return plainToInstance(TrainingPlanResponseDto, plan, MAPPER_OPTIONS);
}

/**
 * Chuyển giáo án sang DTO, bỏ mục tiêu (goal) khi người gọi không được xem.
 *
 * @param plan Thực thể giáo án
 * @param includeGoal Người gọi có được xem goal không
 * @returns TrainingPlanResponseDto - không có key goal khi includeGoal là false
 */
export function toTrainingPlanView(
  plan: TrainingPlanEntity,
  includeGoal: boolean,
): TrainingPlanResponseDto {
  const { goal, ...withoutGoal } = toTrainingPlanResponse(plan);
  return includeGoal ? { ...withoutGoal, goal } : withoutGoal;
}

export function toTrainingSessionResponse(
  row: TrainingSessionEntity,
): TrainingSessionResponseDto {
  return plainToInstance(TrainingSessionResponseDto, row, MAPPER_OPTIONS);
}

export function toTimeTrialResponse(
  row: TimeTrialEntity,
): TimeTrialResponseDto {
  return plainToInstance(TimeTrialResponseDto, row, MAPPER_OPTIONS);
}

export function toEvaluationResponse(
  row: PerformanceEvaluationEntity,
): SessionEvaluationResponseDto {
  return plainToInstance(SessionEvaluationResponseDto, row, MAPPER_OPTIONS);
}

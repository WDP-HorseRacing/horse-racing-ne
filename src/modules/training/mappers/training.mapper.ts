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

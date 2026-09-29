import { plainToInstance } from 'class-transformer';
import { TrainingSessionResponseDto } from '../dto/training-session.dto';
import { TrainingSessionEntity } from '../entities/training-session.entity';

const MAPPER_OPTIONS = { excludeExtraneousValues: true } as const;

export function toTrainingSessionResponse(
  row: TrainingSessionEntity,
): TrainingSessionResponseDto {
  return plainToInstance(TrainingSessionResponseDto, row, MAPPER_OPTIONS);
}

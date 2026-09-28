import { plainToInstance } from 'class-transformer';
import { TrainingClassResponseDto } from '../dto/training-class.dto';
import { TrainingClassEntity } from '../entities/training-class.entity';

const MAPPER_OPTIONS = { excludeExtraneousValues: true } as const;

export function toTrainingClassResponse(
  row: TrainingClassEntity,
): TrainingClassResponseDto {
  return plainToInstance(TrainingClassResponseDto, row, MAPPER_OPTIONS);
}

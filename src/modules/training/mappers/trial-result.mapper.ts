import { plainToInstance } from 'class-transformer';
import { TrialResultResponseDto } from '../dto/time-trial.dto';
import { TrialResultEntity } from '../entities/trial-result.entity';

const MAPPER_OPTIONS = { excludeExtraneousValues: true } as const;

export function toTrialResultResponse(
  row: TrialResultEntity,
): TrialResultResponseDto {
  return plainToInstance(TrialResultResponseDto, row, MAPPER_OPTIONS);
}

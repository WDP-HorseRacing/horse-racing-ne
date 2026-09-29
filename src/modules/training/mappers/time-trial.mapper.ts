import { plainToInstance } from 'class-transformer';
import { TimeTrialResponseDto } from '../dto/time-trial.dto';
import { TimeTrialEntity } from '../entities/time-trial.entity';

const MAPPER_OPTIONS = { excludeExtraneousValues: true } as const;

export function toTimeTrialResponse(
  row: TimeTrialEntity,
): TimeTrialResponseDto {
  return plainToInstance(TimeTrialResponseDto, row, MAPPER_OPTIONS);
}

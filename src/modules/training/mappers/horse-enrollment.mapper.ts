import { plainToInstance } from 'class-transformer';
import { HorseEnrollmentResponseDto } from '../dto/horse-enrollment.dto';
import { HorseEnrollmentEntity } from '../entities/horse-enrollment.entity';

const MAPPER_OPTIONS = { excludeExtraneousValues: true } as const;

export function toHorseEnrollmentResponse(
  row: HorseEnrollmentEntity,
): HorseEnrollmentResponseDto {
  return plainToInstance(HorseEnrollmentResponseDto, row, MAPPER_OPTIONS);
}

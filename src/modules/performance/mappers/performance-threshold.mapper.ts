import { plainToInstance } from 'class-transformer';
import { HorseThresholdsResponseDto } from '../dto/horse-thresholds.dto';
import type { ThresholdLimits } from '../types/performance.types';

/**
 * Ghép con ngựa và bộ ngưỡng đang áp thành response DTO
 *
 * @param horseId UUID của ngựa
 * @param limits Bộ ngưỡng đang áp
 * @returns Ngưỡng đang áp của con ngựa để trả ra API
 */
export function toHorseThresholdsResponse(
  horseId: string,
  limits: ThresholdLimits,
): HorseThresholdsResponseDto {
  return plainToInstance(
    HorseThresholdsResponseDto,
    { horseId, limits },
    { excludeExtraneousValues: true },
  );
}

import { plainToInstance } from 'class-transformer';
import {
  HorseThresholdsResponseDto,
  ThresholdLimitsDto,
  ThresholdProfileResponseDto,
} from '../dto/upsert-threshold.dto';
import { PerformanceThresholdEntity } from '../entities/performance-threshold.entity';
import type { ActiveThreshold } from '../types/performance.types';

const MAPPER_OPTIONS = { excludeExtraneousValues: true } as const;

/**
 * Chuyển một phiên bản ngưỡng sang response DTO
 *
 * @param row Phiên bản ngưỡng của ngựa
 * @returns Phiên bản ngưỡng để trả ra API
 */
export function toThresholdProfileResponse(
  row: PerformanceThresholdEntity,
): ThresholdProfileResponseDto {
  return plainToInstance(ThresholdProfileResponseDto, row, MAPPER_OPTIONS);
}

/**
 * Ghép ngưỡng đang áp và lịch sử phiên bản của con ngựa thành response DTO
 *
 * @param active Bộ ngưỡng đang áp tại thời điểm gọi
 * @param profiles Các phiên bản ngưỡng riêng của ngựa, mới nhất đứng đầu
 * @returns Ngưỡng đang áp kèm nguồn và lịch sử phiên bản
 */
export function toHorseThresholdsResponse(
  active: ActiveThreshold,
  profiles: PerformanceThresholdEntity[],
): HorseThresholdsResponseDto {
  return {
    source: active.source,
    activeLimits: plainToInstance(
      ThresholdLimitsDto,
      active.limits,
      MAPPER_OPTIONS,
    ),
    profiles: profiles.map(toThresholdProfileResponse),
  };
}

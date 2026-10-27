import type { DailyFeeResponseDto } from '../dto/daily-fee.dto';
import type { DailyFeeEntity } from '../entities/daily-fee.entity';

/**
 * Chuyển một mức phí nuôi theo ngày sang response
 *
 * @param entity Mức phí
 * @returns Response của mức phí
 */
export function toDailyFeeResponse(
  entity: DailyFeeEntity,
): DailyFeeResponseDto {
  return {
    id: entity.id,
    effectiveFrom: entity.effectiveFrom,
    dailyFee: Number(entity.dailyFee),
    createdBy: entity.createdBy,
    createdAt: entity.createdAt,
  };
}

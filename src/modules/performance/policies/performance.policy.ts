import { BadRequestException } from '@nestjs/common';
import type { ThresholdLimits } from '../types/performance.types';

/**
 * Kiểm bộ ngưỡng và khoảng hiệu lực trước khi lưu
 *
 * @param limits Bộ ngưỡng cần lưu
 * @param effectiveFrom Thời điểm bắt đầu hiệu lực
 * @param effectiveTo Thời điểm hết hiệu lực, null nếu không giới hạn
 * @throws BadRequestException Nếu ngưỡng cảnh báo nhịp tim không nhỏ hơn ngưỡng nguy hiểm, hoặc thời điểm hết hiệu lực không sau thời điểm bắt đầu
 */
export function assertThresholdProfile(
  limits: ThresholdLimits,
  effectiveFrom: Date,
  effectiveTo: Date | null,
): void {
  if (limits.heartRateWarningBpm >= limits.heartRateCriticalBpm) {
    throw new BadRequestException(
      'Ngưỡng cảnh báo nhịp tim phải nhỏ hơn ngưỡng nguy hiểm',
    );
  }
  if (effectiveTo && effectiveTo <= effectiveFrom) {
    throw new BadRequestException(
      'Thời điểm hết hiệu lực phải sau thời điểm bắt đầu',
    );
  }
}

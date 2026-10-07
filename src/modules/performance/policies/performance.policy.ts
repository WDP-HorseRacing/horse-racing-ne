import { BadRequestException, ConflictException } from '@nestjs/common';
import { SessionParticipantStatus } from '../../training/enums/session-participant-status.enum';
import { MetricAlertLevel } from '../enums/metric-alert-level.enum';
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

/**
 * Chỉ nhận điểm đo khi lượt tập đang diễn ra
 *
 * @param status Trạng thái của lượt tập
 * @throws ConflictException Nếu lượt tập không ở ONGOING
 */
export function assertParticipantRecording(
  status: SessionParticipantStatus,
): void {
  if (status !== SessionParticipantStatus.ONGOING) {
    throw new ConflictException('Chỉ nhận điểm đo khi lượt tập đang diễn ra');
  }
}

/**
 * Chấm mức cảnh báo cho một điểm đo theo bộ ngưỡng của con ngựa
 *
 * - Nhịp tim vượt heartRateCriticalBpm: CRITICAL
 * - Nhịp tim vượt heartRateWarningBpm hoặc tốc độ vượt maxSpeedMps: WARNING
 * - Còn lại: NORMAL
 *
 * @param heartRateBpm Nhịp tim (bpm)
 * @param speedMps Tốc độ (m/s)
 * @param limits Bộ ngưỡng đang áp cho con ngựa
 * @returns Mức cảnh báo của điểm đo
 */
export function classifyMetric(
  heartRateBpm: number,
  speedMps: number,
  limits: ThresholdLimits,
): MetricAlertLevel {
  if (heartRateBpm > limits.heartRateCriticalBpm) {
    return MetricAlertLevel.CRITICAL;
  }
  if (
    heartRateBpm > limits.heartRateWarningBpm ||
    speedMps > limits.maxSpeedMps
  ) {
    return MetricAlertLevel.WARNING;
  }
  return MetricAlertLevel.NORMAL;
}

import { ConflictException } from '@nestjs/common';
import { SessionParticipantStatus } from '../../training/enums/session-participant-status.enum';
import {
  MAX_PLAUSIBLE_SPEED_MPS,
  METRIC_CLOCK_SKEW_MS,
} from '../constants/performance.constants';
import { MetricAlertLevel } from '../enums/metric-alert-level.enum';
import type {
  ClassifiedMetric,
  ThresholdLimits,
} from '../types/performance.types';

const ALERT_RANK: Record<MetricAlertLevel, number> = {
  [MetricAlertLevel.NORMAL]: 0,
  [MetricAlertLevel.WARNING]: 1,
  [MetricAlertLevel.CRITICAL]: 2,
};

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
 * Kiểm một điểm đo có thể là số đo thật của lượt tập hay không
 *
 * - Tốc độ vượt MAX_PLAUSIBLE_SPEED_MPS: không hợp lệ
 * - Thời điểm đo trước lúc lượt bắt đầu hoặc sau hiện tại, quá METRIC_CLOCK_SKEW_MS: không hợp lệ
 * - Lượt chưa ghi lúc bắt đầu: chỉ kiểm mốc hiện tại
 *
 * @param metric Thời điểm đo và tốc độ của điểm đo
 * @param startedAt Lúc lượt tập bắt đầu, null nếu chưa ghi
 * @param now Thời điểm máy chủ nhận điểm đo
 * @returns true nếu điểm đo hợp lệ
 */
export function isPlausibleMetric(
  metric: { recordedAt: Date; speedMps: number },
  startedAt: Date | null,
  now: Date,
): boolean {
  const recordedAt = metric.recordedAt.getTime();
  if (metric.speedMps > MAX_PLAUSIBLE_SPEED_MPS) return false;
  if (recordedAt > now.getTime() + METRIC_CLOCK_SKEW_MS) return false;
  return (
    startedAt === null ||
    recordedAt >= startedAt.getTime() - METRIC_CLOCK_SKEW_MS
  );
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

/** Bỏ điểm trùng trong cùng lô, giữ lần xuất hiện đầu của cảm biến và thời điểm. */
export function uniqueBySourceAndTime(
  points: ClassifiedMetric[],
): ClassifiedMetric[] {
  const seen = new Set<string>();
  return points.filter((point) => {
    const key = metricIdentity(point.sourceId, point.recordedAt);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Tạo khóa dùng chung để so điểm trong lô với điểm đã lưu. */
export function metricIdentity(sourceId: string, recordedAt: Date): string {
  return `${sourceId}|${recordedAt.toISOString()}`;
}

/** Lấy mức cảnh báo cao nhất; trả NORMAL nếu lô không có điểm đo. */
export function highestAlertLevel(
  points: ClassifiedMetric[],
): MetricAlertLevel {
  return points.reduce(
    (highest, point) =>
      ALERT_RANK[point.alertLevel] > ALERT_RANK[highest]
        ? point.alertLevel
        : highest,
    MetricAlertLevel.NORMAL,
  );
}

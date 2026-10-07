import type { ThresholdLimits } from '../types/performance.types';

/**
 * Ngưỡng mặc định của CLB, áp cho ngựa chưa có bộ ngưỡng riêng đang hiệu lực
 */
export const DEFAULT_THRESHOLD_LIMITS: ThresholdLimits = {
  heartRateWarningBpm: 220,
  heartRateCriticalBpm: 240,
  maxSpeedMps: 18,
};

/**
 * Số buổi tập tối đa trả về khi tổng hợp theo buổi.
 */
export const PERFORMANCE_SESSION_LIMIT = 100;

/**
 * Số điểm đo thô tối đa trả về cho tổng quan của ngựa.
 */
export const RECENT_METRIC_LIMIT = 100;

/**
 * Số chữ số thập phân của tốc độ (m/s).
 */
export const SPEED_SCALE = 3;

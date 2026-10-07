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
 * Số điểm đo tối đa trả về cho một lượt tập (2 giờ với nhịp 1 điểm/giây).
 */
export const PARTICIPANT_METRIC_LIMIT = 7200;

/**
 * Số chữ số thập phân của tốc độ (m/s).
 */
export const SPEED_SCALE = 3;

/**
 * Tên domain event khi một lượt tập có điểm đo vượt ngưỡng nguy hiểm
 */
export const PERFORMANCE_METRIC_CRITICAL_EVENT = 'performance.metric.critical';

/**
 * Tên sự kiện socket đẩy các điểm đo vừa nhận tới Head Trainer của lớp
 */
export const PERFORMANCE_METRICS_SOCKET_EVENT = 'performance.metrics';

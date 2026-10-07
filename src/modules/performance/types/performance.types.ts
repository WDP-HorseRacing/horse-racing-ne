import type { ThresholdSource } from '../enums/threshold-source.enum';

/**
 * Chỉ số gom theo một lượt tập của con ngựa, chưa làm tròn.
 *
 * - sumSpeedMps, maxSpeedMps là số thập phân dạng chuỗi
 * - scheduledAt là giờ bắt đầu dự kiến của buổi tập
 */
export interface SessionMetricAggregate {
  sessionParticipantId: string;
  sessionId: string;
  scheduledAt: Date;
  count: number;
  sumHeartRateBpm: number;
  maxHeartRateBpm: number;
  sumSpeedMps: string;
  maxSpeedMps: string;
  alertCount: number;
}

/**
 * Bộ ngưỡng nhịp tim và tốc độ của một con ngựa.
 *
 * - Nhịp tim vượt heartRateWarningBpm: WARNING; vượt heartRateCriticalBpm: CRITICAL
 * - Tốc độ vượt maxSpeedMps: WARNING
 */
export interface ThresholdLimits {
  heartRateWarningBpm: number;
  heartRateCriticalBpm: number;
  maxSpeedMps: number;
}

/**
 * Bộ ngưỡng đang áp cho con ngựa tại một thời điểm.
 *
 * - HORSE: lấy từ phiên bản ngưỡng riêng của ngựa, kèm id phiên bản
 * - CLUB_DEFAULT: ngựa chưa có phiên bản nào đang hiệu lực, dùng mặc định CLB
 */
export type ActiveThreshold =
  | {
      source: ThresholdSource.HORSE;
      limits: ThresholdLimits;
      profileId: string;
    }
  | { source: ThresholdSource.CLUB_DEFAULT; limits: ThresholdLimits };

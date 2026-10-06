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

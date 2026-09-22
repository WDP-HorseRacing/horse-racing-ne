/**
 * Một dòng kết quả của câu query tổng hợp chỉ số theo từng buổi tập.
 */
export interface SessionPerformanceRow {
  sessionId: string;
  scheduledAt: Date;
  avgHeartRateBpm: number;
  maxHeartRateBpm: number;
  avgSpeedMps: string;
  maxSpeedMps: string;
  alertCount: number;
}

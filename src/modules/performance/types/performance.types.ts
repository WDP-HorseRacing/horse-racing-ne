/**
 * Một dòng kết quả của câu query tổng hợp chỉ số theo từng buổi tập.
 */
export interface SessionPerformanceRow {
  sessionParticipantId?: string;
  sessionId: string;
  scheduledAt: Date;
  avgHeartRateBpm: number;
  maxHeartRateBpm: number;
  avgSpeedMps: string;
  maxSpeedMps: string;
  alertCount: number;
}

/**
 * Một điểm đo thô của con ngựa, tốc độ đã định dạng 3 chữ số thập phân.
 */
export interface PerformanceMetricPoint {
  sessionParticipantId: string;
  recordedAt: Date;
  heartRateBpm: number;
  speedMps: string;
  alertLevel: string;
}

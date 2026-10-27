import type { SessionParticipantStatus } from '../../training/enums/session-participant-status.enum';
import type { TrainingIntensity } from '../../training/enums/training-intensity.enum';
import type { MetricAlertLevel } from '../enums/metric-alert-level.enum';

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
 * Bộ ngưỡng nhịp tim và tốc độ dùng để chấm mức điểm đo.
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
 * Một điểm đo đã chấm mức cảnh báo, sẵn sàng lưu.
 */
export interface ClassifiedMetric {
  sourceId: string;
  recordedAt: Date;
  heartRateBpm: number;
  speedMps: string;
  alertLevel: MetricAlertLevel;
}

/**
 * Payload của PERFORMANCE_METRIC_CRITICAL_EVENT.
 *
 * - eventId cố định theo lượt tập: mỗi lượt chỉ sinh một thông báo dù nhiều điểm đo vượt ngưỡng
 * - headTrainerId là Head Trainer phụ trách lớp của buổi tập, null nếu lớp chưa có Head Trainer
 * - recordedAt là chuỗi ISO, speedMps là số thập phân dạng chuỗi
 */
export interface PerformanceMetricCriticalEvent {
  eventId: string;
  horseId: string;
  sessionId: string;
  sessionParticipantId: string;
  headTrainerId: string | null;
  heartRateBpm: number;
  speedMps: string;
  recordedAt: string;
}

/**
 * Chỉ số gom của mọi điểm đo trong một lượt tập, chưa làm tròn.
 *
 * - sumSpeedMps, maxSpeedMps là số thập phân dạng chuỗi
 */
export interface ParticipantMetricAggregate {
  count: number;
  sumHeartRateBpm: number;
  maxHeartRateBpm: number;
  sumSpeedMps: string;
  maxSpeedMps: string;
  warningCount: number;
  criticalCount: number;
  firstRecordedAt: Date;
  lastRecordedAt: Date;
}

/**
 * Một lượt tập đã hoàn thành hoặc dừng sớm dùng để tính khối lượng tập.
 *
 * - durationSeconds là số giây từ lúc bắt đầu tới lúc kết thúc lượt
 */
export interface FinishedParticipantLoad {
  participantId: string;
  status: SessionParticipantStatus.COMPLETED | SessionParticipantStatus.STOPPED;
  intensity: TrainingIntensity;
  plannedDistanceM: number;
  durationSeconds: number;
}

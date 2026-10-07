import {
  HorsePerformanceResponseDto,
  ParticipantPerformanceSummaryDto,
  PerformanceEvaluationDto,
  PerformanceMetricPointDto,
  SessionPerformanceSummaryDto,
} from '../dto/horse-performance.response.dto';
import { averageDecimal, roundDecimal } from '../../../common/utils/decimal';
import { SPEED_SCALE } from '../constants/performance.constants';
import { PerformanceEvaluationEntity } from '../entities/performance-evaluation.entity';
import type { PerformanceMetric } from '../schemas/performance-metric.schema';
import type {
  ParticipantMetricAggregate,
  SessionMetricAggregate,
} from '../types/performance.types';

/**
 * Chuyển chỉ số gom theo một lượt tập sang DTO
 *
 * - Nhịp tim trung bình làm tròn tới số nguyên; tốc độ trung bình và cao nhất làm tròn SPEED_SCALE chữ số thập phân
 * - Làm tròn nửa xa số 0
 *
 * @param aggregate Chỉ số gom của một lượt tập
 * @returns SessionPerformanceSummaryDto - Chỉ số tổng hợp của buổi tập
 */
export function toSessionPerformanceSummary(
  aggregate: SessionMetricAggregate,
): SessionPerformanceSummaryDto {
  return {
    sessionId: aggregate.sessionId,
    scheduledAt: aggregate.scheduledAt,
    avgHeartRateBpm: Number(
      averageDecimal(String(aggregate.sumHeartRateBpm), aggregate.count, 0),
    ),
    maxHeartRateBpm: aggregate.maxHeartRateBpm,
    avgSpeedMps: averageDecimal(
      aggregate.sumSpeedMps,
      aggregate.count,
      SPEED_SCALE,
    ),
    maxSpeedMps: roundDecimal(aggregate.maxSpeedMps, SPEED_SCALE),
    alertCount: aggregate.alertCount,
  };
}

/**
 * Chuyển chỉ số gom của một lượt tập sang DTO tổng kết
 *
 * - Chưa có điểm đo: count 0, các chỉ số và mốc thời gian là null
 * - Trung bình làm tròn nửa xa số 0: nhịp tim tới số nguyên, tốc độ tới SPEED_SCALE chữ số
 *
 * @param sessionParticipantId UUID của lượt tập
 * @param aggregate Chỉ số gom, null nếu lượt chưa có điểm đo
 * @returns Tổng kết chỉ số của lượt tập
 */
export function toParticipantPerformanceSummary(
  sessionParticipantId: string,
  aggregate: ParticipantMetricAggregate | null,
): ParticipantPerformanceSummaryDto {
  if (!aggregate) {
    return {
      sessionParticipantId,
      count: 0,
      avgHeartRateBpm: null,
      maxHeartRateBpm: null,
      avgSpeedMps: null,
      maxSpeedMps: null,
      warningCount: 0,
      criticalCount: 0,
      firstRecordedAt: null,
      lastRecordedAt: null,
    };
  }
  return {
    sessionParticipantId,
    count: aggregate.count,
    avgHeartRateBpm: Number(
      averageDecimal(String(aggregate.sumHeartRateBpm), aggregate.count, 0),
    ),
    maxHeartRateBpm: aggregate.maxHeartRateBpm,
    avgSpeedMps: averageDecimal(
      aggregate.sumSpeedMps,
      aggregate.count,
      SPEED_SCALE,
    ),
    maxSpeedMps: roundDecimal(aggregate.maxSpeedMps, SPEED_SCALE),
    warningCount: aggregate.warningCount,
    criticalCount: aggregate.criticalCount,
    firstRecordedAt: aggregate.firstRecordedAt,
    lastRecordedAt: aggregate.lastRecordedAt,
  };
}

/**
 * Chuyển một điểm đo thô sang DTO
 *
 * - Tốc độ định dạng đúng SPEED_SCALE chữ số thập phân
 *
 * @param metric Điểm đo đã lưu
 * @returns PerformanceMetricPointDto - Điểm đo
 */
export function toMetricPoint(
  metric: PerformanceMetric,
): PerformanceMetricPointDto {
  return {
    recordedAt: metric.recordedAt,
    heartRateBpm: metric.heartRateBpm,
    speedMps: roundDecimal(metric.speedMps.toString(), SPEED_SCALE),
    alertLevel: metric.alertLevel,
  };
}

/**
 * Chuyển đánh giá buổi tập sang dạng rút gọn dùng trong tổng quan của ngựa.
 *
 * @param evaluation Thực thể đánh giá
 * @returns PerformanceEvaluationDto - Đánh giá rút gọn
 */
export function toPerformanceEvaluation(
  evaluation: PerformanceEvaluationEntity,
): PerformanceEvaluationDto {
  return {
    createdAt: evaluation.createdAt,
    score: evaluation.score,
    comment: evaluation.comment,
  };
}

/**
 * Dựng tổng quan chỉ số của ngựa từ các điểm đo và đánh giá gần nhất.
 *
 * @param horseId UUID của ngựa
 * @param metrics Các điểm đo gần nhất, mới nhất đứng đầu
 * @param evaluations Các đánh giá, mới nhất đứng đầu
 * @returns HorsePerformanceResponseDto - Tổng quan chỉ số của ngựa
 */
export function toHorsePerformanceResponse(
  horseId: string,
  metrics: PerformanceMetric[],
  evaluations: PerformanceEvaluationEntity[],
): HorsePerformanceResponseDto {
  const recentMetrics = metrics.map(toMetricPoint);
  return {
    horseId,
    sessionsTracked: new Set(
      metrics.map((metric) => metric.meta.sessionParticipantId),
    ).size,
    latestMetric: recentMetrics[0] ?? null,
    recentMetrics,
    latestEvaluation: evaluations[0]
      ? toPerformanceEvaluation(evaluations[0])
      : null,
  };
}

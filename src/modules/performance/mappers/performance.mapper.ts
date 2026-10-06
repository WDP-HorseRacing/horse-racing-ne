import {
  HorsePerformanceResponseDto,
  PerformanceEvaluationDto,
  PerformanceMetricPointDto,
  SessionPerformanceSummaryDto,
} from '../dto/horse-performance.response.dto';
import { averageDecimal, roundDecimal } from '../../../common/utils/decimal';
import { SPEED_SCALE } from '../constants/performance.constants';
import { PerformanceEvaluationEntity } from '../entities/performance-evaluation.entity';
import type { PerformanceMetric } from '../schemas/performance-metric.schema';
import type { SessionMetricAggregate } from '../types/performance.types';

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

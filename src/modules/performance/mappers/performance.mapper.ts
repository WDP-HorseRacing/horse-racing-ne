import {
  HorsePerformanceResponseDto,
  PerformanceEvaluationDto,
  PerformanceMetricPointDto,
  SessionPerformanceSummaryDto,
} from '../dto/horse-performance.response.dto';
import { PerformanceEvaluationEntity } from '../entities/performance-evaluation.entity';
import { PerformanceMetricEntity } from '../entities/performance-metric.entity';
import type { SessionPerformanceRow } from '../types/performance.types';

/**
 * Chuyển dòng tổng hợp chỉ số của một buổi tập sang DTO.
 *
 * @param row Dòng tổng hợp của một buổi tập
 * @returns SessionPerformanceSummaryDto - Chỉ số tổng hợp của buổi tập
 */
export function toSessionPerformanceSummary(
  row: SessionPerformanceRow,
): SessionPerformanceSummaryDto {
  return {
    sessionId: row.sessionId,
    scheduledAt: row.scheduledAt,
    avgHeartRateBpm: row.avgHeartRateBpm,
    maxHeartRateBpm: row.maxHeartRateBpm,
    avgSpeedMps: row.avgSpeedMps,
    maxSpeedMps: row.maxSpeedMps,
    alertCount: row.alertCount,
  };
}

/**
 * Chuyển một điểm đo thô sang DTO.
 *
 * @param metric Thực thể điểm đo
 * @returns PerformanceMetricPointDto - Điểm đo
 */
export function toMetricPoint(
  metric: PerformanceMetricEntity,
): PerformanceMetricPointDto {
  return {
    recordedAt: metric.recordedAt,
    heartRateBpm: metric.heartRateBpm,
    speedMps: metric.speedMps,
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
  metrics: PerformanceMetricEntity[],
  evaluations: PerformanceEvaluationEntity[],
): HorsePerformanceResponseDto {
  const recentMetrics = metrics.map(toMetricPoint);
  return {
    horseId,
    sessionsTracked: new Set(metrics.map((metric) => metric.sessionId)).size,
    latestMetric: recentMetrics[0] ?? null,
    recentMetrics,
    latestEvaluation: evaluations[0]
      ? toPerformanceEvaluation(evaluations[0])
      : null,
  };
}

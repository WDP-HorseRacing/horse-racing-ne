import { Injectable } from '@nestjs/common';
import type { Actor } from '../../../common/types/actor';
import { HorsePerformanceResponseDto } from '../dto/horse-performance.response.dto';
import { PerformanceRepository } from '../repositories/performance.repository';

@Injectable()
export class PerformanceService {
  constructor(private readonly performanceRepository: PerformanceRepository) {}

  async getHorseSummary(
    actor: Actor,
    horseId: string,
  ): Promise<HorsePerformanceResponseDto> {
    const metrics = await this.performanceRepository.listMetrics(
      horseId,
      actor.clubId,
    );
    const evaluations = await this.performanceRepository.listEvaluations(
      horseId,
      actor.clubId,
    );
    const recentMetrics = metrics.map((metric) => ({
      recordedAt: metric.recordedAt,
      heartRateBpm: metric.heartRateBpm,
      speedMps: metric.speedMps,
      alertLevel: metric.alertLevel,
    }));
    const latestEvaluation = evaluations[0]
      ? {
          createdAt: evaluations[0].createdAt,
          score: evaluations[0].score,
          comment: evaluations[0].comment,
        }
      : null;

    return {
      horseId,
      sessionsTracked: new Set(metrics.map((metric) => metric.sessionId)).size,
      latestMetric: recentMetrics[0] ?? null,
      recentMetrics,
      latestEvaluation,
    };
  }
}

import { PerformanceEvaluationEntity } from '../entities/performance-evaluation.entity';
import { Types } from 'mongoose';
import { MetricAlertLevel } from '../enums/metric-alert-level.enum';
import type { PerformanceMetric } from '../schemas/performance-metric.schema';
import {
  toHorsePerformanceResponse,
  toSessionPerformanceSummary,
} from './performance.mapper';

describe('toSessionPerformanceSummary', () => {
  it('averages and rounds half away from zero, keeping only the summary fields', () => {
    const aggregate = {
      sessionParticipantId: 'participant-1',
      sessionId: 'session-1',
      scheduledAt: new Date('2026-09-18T06:00:00Z'),
      count: 2,
      sumHeartRateBpm: 301,
      maxHeartRateBpm: 180,
      sumSpeedMps: '25.165',
      maxSpeedMps: '15.25',
      alertCount: 1,
    };
    expect(toSessionPerformanceSummary(aggregate)).toEqual({
      sessionId: 'session-1',
      scheduledAt: aggregate.scheduledAt,
      avgHeartRateBpm: 151,
      maxHeartRateBpm: 180,
      avgSpeedMps: '12.583',
      maxSpeedMps: '15.250',
      alertCount: 1,
    });
  });
});

describe('toHorsePerformanceResponse', () => {
  it('counts tracked sessions and keeps the newest point and evaluation first', () => {
    const point = (
      sessionParticipantId: string,
      heartRateBpm: number,
    ): PerformanceMetric => ({
      recordedAt: new Date('2026-09-18T06:00:00Z'),
      meta: {
        horseId: 'h1',
        sessionParticipantId,
        sessionId: `session-of-${sessionParticipantId}`,
        sourceId: 'sensor-1',
      },
      heartRateBpm,
      speedMps: Types.Decimal128.fromString('12'),
      alertLevel: MetricAlertLevel.NORMAL,
    });
    const evaluation = Object.assign(new PerformanceEvaluationEntity(), {
      createdAt: new Date('2026-09-18T08:00:00Z'),
      score: 8,
      comment: null,
    });

    const summary = toHorsePerformanceResponse(
      'h1',
      [point('s2', 170), point('s1', 150), point('s1', 140)],
      [evaluation],
    );

    expect(summary.sessionsTracked).toBe(2);
    expect(summary.latestMetric?.heartRateBpm).toBe(170);
    expect(summary.recentMetrics).toHaveLength(3);
    expect(summary.latestEvaluation?.score).toBe(8);
  });

  it('returns null for the latest point and evaluation when nothing is recorded', () => {
    const summary = toHorsePerformanceResponse('h1', [], []);
    expect(summary.latestMetric).toBeNull();
    expect(summary.latestEvaluation).toBeNull();
  });
});

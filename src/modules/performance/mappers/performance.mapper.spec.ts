import { PerformanceEvaluationEntity } from '../../training/entities/performance-evaluation.entity';
import { PerformanceMetricEntity } from '../entities/performance-metric.entity';
import {
  toHorsePerformanceResponse,
  toSessionPerformanceSummary,
} from './performance.mapper';

describe('toSessionPerformanceSummary', () => {
  it('keeps only the summary fields of a session row', () => {
    const row = {
      sessionId: 'session-1',
      scheduledAt: new Date('2026-09-18T06:00:00Z'),
      avgHeartRateBpm: 150,
      maxHeartRateBpm: 180,
      avgSpeedMps: '12.583',
      maxSpeedMps: '15.250',
      alertCount: 1,
      horseId: 'h1',
    };
    expect(toSessionPerformanceSummary(row)).toEqual({
      sessionId: 'session-1',
      scheduledAt: row.scheduledAt,
      avgHeartRateBpm: 150,
      maxHeartRateBpm: 180,
      avgSpeedMps: '12.583',
      maxSpeedMps: '15.250',
      alertCount: 1,
    });
  });
});

describe('toHorsePerformanceResponse', () => {
  it('counts tracked sessions and keeps the newest point and evaluation first', () => {
    const point = (sessionId: string, heartRateBpm: number) =>
      Object.assign(new PerformanceMetricEntity(), {
        sessionId,
        recordedAt: new Date('2026-09-18T06:00:00Z'),
        heartRateBpm,
        speedMps: '12.000',
        alertLevel: 'NORMAL',
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

import { ConflictException } from '@nestjs/common';
import { SessionParticipantStatus } from '../../training/enums/session-participant-status.enum';
import { MetricAlertLevel } from '../enums/metric-alert-level.enum';
import {
  assertParticipantRecording,
  classifyMetric,
  isPlausibleMetric,
} from './performance.policy';

describe('assertParticipantRecording', () => {
  it('accepts an ongoing participant', () => {
    expect(() =>
      assertParticipantRecording(SessionParticipantStatus.ONGOING),
    ).not.toThrow();
  });

  it.each([SessionParticipantStatus.READY, SessionParticipantStatus.COMPLETED])(
    'rejects a %s participant',
    (status) => {
      expect(() => assertParticipantRecording(status)).toThrow(
        ConflictException,
      );
    },
  );
});

describe('classifyMetric', () => {
  const limits = {
    heartRateWarningBpm: 220,
    heartRateCriticalBpm: 240,
    maxSpeedMps: 18,
  };

  it.each([
    [220, 18, MetricAlertLevel.NORMAL],
    [221, 10, MetricAlertLevel.WARNING],
    [150, 18.001, MetricAlertLevel.WARNING],
    [241, 10, MetricAlertLevel.CRITICAL],
    [241, 25, MetricAlertLevel.CRITICAL],
  ])('classifies %d bpm at %d m/s as %s', (heartRate, speed, level) => {
    expect(classifyMetric(heartRate, speed, limits)).toBe(level);
  });
});

describe('isPlausibleMetric', () => {
  const startedAt = new Date('2026-10-10T01:00:00Z');
  const now = new Date('2026-10-10T01:10:00Z');
  const at = (iso: string, speedMps = 12) => ({
    recordedAt: new Date(iso),
    speedMps,
  });

  it('accepts a point between the start and now, up to the speed cap', () => {
    expect(isPlausibleMetric(at('2026-10-10T01:05:00Z'), startedAt, now)).toBe(
      true,
    );
    expect(
      isPlausibleMetric(at('2026-10-10T01:05:00Z', 25), startedAt, now),
    ).toBe(true);
  });

  it('allows 5 seconds of clock skew on both ends', () => {
    expect(isPlausibleMetric(at('2026-10-10T00:59:55Z'), startedAt, now)).toBe(
      true,
    );
    expect(isPlausibleMetric(at('2026-10-10T01:10:05Z'), startedAt, now)).toBe(
      true,
    );
  });

  it('rejects a point beyond the speed cap or outside the run', () => {
    expect(
      isPlausibleMetric(at('2026-10-10T01:05:00Z', 25.001), startedAt, now),
    ).toBe(false);
    expect(isPlausibleMetric(at('2026-10-10T00:59:54Z'), startedAt, now)).toBe(
      false,
    );
    expect(isPlausibleMetric(at('2026-10-10T01:10:06Z'), startedAt, now)).toBe(
      false,
    );
  });

  it('only checks the upper bound when the start is unknown', () => {
    expect(isPlausibleMetric(at('2020-01-01T00:00:00Z'), null, now)).toBe(true);
    expect(isPlausibleMetric(at('2026-10-10T01:10:06Z'), null, now)).toBe(
      false,
    );
  });
});

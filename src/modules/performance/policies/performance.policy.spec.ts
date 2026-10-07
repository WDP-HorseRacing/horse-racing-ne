import { BadRequestException, ConflictException } from '@nestjs/common';
import { SessionParticipantStatus } from '../../training/enums/session-participant-status.enum';
import { MetricAlertLevel } from '../enums/metric-alert-level.enum';
import {
  assertParticipantRecording,
  assertThresholdProfile,
  classifyMetric,
} from './performance.policy';

describe('assertThresholdProfile', () => {
  const from = new Date('2026-10-01T00:00:00Z');
  const limits = {
    heartRateWarningBpm: 220,
    heartRateCriticalBpm: 240,
    maxSpeedMps: 18,
  };

  it('accepts a valid open-ended profile', () => {
    expect(() => assertThresholdProfile(limits, from, null)).not.toThrow();
  });

  it('rejects a warning heart rate that is not below the critical one', () => {
    expect(() =>
      assertThresholdProfile(
        { ...limits, heartRateWarningBpm: 240 },
        from,
        null,
      ),
    ).toThrow(BadRequestException);
  });

  it('rejects an end that is not after the start', () => {
    expect(() => assertThresholdProfile(limits, from, from)).toThrow(
      new BadRequestException(
        'Thời điểm hết hiệu lực phải sau thời điểm bắt đầu',
      ),
    );
  });
});

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

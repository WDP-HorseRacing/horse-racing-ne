import { BadRequestException } from '@nestjs/common';
import { assertThresholdProfile } from './performance.policy';

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

import type { HorseMeasurementEntity } from '../entities/horse-measurement.entity';
import { HorseMeasurementType } from '../enums/horse-measurement-type.enum';
import { toLatestMeasurement } from './horse-measurements.mapper';

describe('toLatestMeasurement', () => {
  it('returns the abnormal flag stored at record time, not one recalculated from today’s range', () => {
    const entity = {
      type: HorseMeasurementType.TEMPERATURE,
      value: '38.00',
      measuredAt: new Date('2026-09-01T08:00:00Z'),
      isAbnormal: true,
    } as HorseMeasurementEntity;

    expect(toLatestMeasurement(entity).isAbnormal).toBe(true);
  });
});

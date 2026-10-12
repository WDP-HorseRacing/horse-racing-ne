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

  it('returns the numeric column value as a JSON number', () => {
    const entity = {
      type: HorseMeasurementType.WEIGHT,
      value: '512.50',
      measuredAt: new Date('2026-09-01T08:00:00Z'),
      isAbnormal: false,
    } as HorseMeasurementEntity;

    expect(toLatestMeasurement(entity).value).toBe(512.5);
  });
});

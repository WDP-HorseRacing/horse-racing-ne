import type {
  CreatedHorseMeasurementResponseDto,
  HorseLatestMeasurementDto,
  HorseMeasurementResponseDto,
} from '../dto/horse-measure.dto';
import type { HorseMeasurementEntity } from '../entities/horse-measurement.entity';
import { HORSE_MEASUREMENT_SPECS } from '../enums/horse.constants';
import { isAbnormalMeasurement } from '../policies/horse.policy';
import { requiredRelationName } from './horse.mapper';
import type { HorseMeasurementAlertResult } from '../types/horse.types';

/**
 * Map the latest horse measurement fields, including its unit and abnormal flag.
 *
 * @param entity The horse measurement entity
 * @returns The latest measurement response fields
 */
export function toLatestMeasurement(
  entity: HorseMeasurementEntity,
): HorseLatestMeasurementDto {
  return {
    type: entity.type,
    value: entity.value,
    unit: HORSE_MEASUREMENT_SPECS[entity.type].unit,
    measuredAt: entity.measuredAt,
    isAbnormal: isAbnormalMeasurement(entity.type, Number(entity.value)),
  };
}

/**
 * Map a measurement history row with its measurer's name.
 *
 * @param entity The horse measurement entity with its measurer relation loaded
 * @returns The measurement response
 */
export function toMeasurementResponse(
  entity: HorseMeasurementEntity,
): HorseMeasurementResponseDto {
  return {
    id: entity.id,
    horseId: entity.horseId,
    measuredBy: entity.measuredBy,
    measuredByName: requiredRelationName(entity.measurer, 'measurer'),
    ...toLatestMeasurement(entity),
  };
}

/**
 * Map a newly created measurement together with its automatically calculated alerts.
 *
 * @param entity The saved measurement entity with its measurer relation loaded
 * @param alerts The alerts calculated for this measurement
 * @returns The created measurement response; FEVER alerts have null baseline and drop values
 */
export function toCreatedMeasurementResponse(
  entity: HorseMeasurementEntity,
  alerts: HorseMeasurementAlertResult[],
): CreatedHorseMeasurementResponseDto {
  return {
    ...toMeasurementResponse(entity),
    alerts: alerts.map((alert) => ({
      alert: alert.alert,
      severity: alert.severity,
      baselineValue: 'baselineValue' in alert ? alert.baselineValue : null,
      dropPercent: 'dropPercent' in alert ? alert.dropPercent : null,
    })),
  };
}

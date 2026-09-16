import { HorseOwnershipResponseDto } from '../dto/horse-ownership.response.dto';
import { HORSE_MEASUREMENT_SPECS } from '../constants/horse-measurement-type.enum';
import {
  HorseLatestMeasurementDto,
  HorseMeasurementResponseDto,
} from '../dto/horse-measurement.response.dto';
import {
  HorseParentSummaryDto,
  HorseResponseDto,
} from '../dto/horse.response.dto';
import { HorseOwnershipEntity } from '../entities/horse-ownership.entity';
import { HorseMeasurementEntity } from '../entities/horse-measurement.entity';
import { HorseEntity } from '../entities/horse.entity';

export function toHorseResponse(entity: HorseEntity): HorseResponseDto {
  return {
    id: entity.id,
    name: entity.name,
    gender: entity.gender,
    breed: entity.breed,
    color: entity.color,
    raceAptitude: entity.raceAptitude,
    dateOfBirth: entity.dateOfBirth,
    microchipId: entity.microchipId,
    mediaId: entity.mediaId,
    sireId: entity.sireId,
    damId: entity.damId,
    isReference: entity.isReference,
    healthStatus: entity.healthStatus,
    lifecycleStatus: entity.lifecycleStatus,
  };
}

export function toParentSummary(
  entity: HorseEntity | null,
): HorseParentSummaryDto | null {
  if (!entity) return null;
  return { id: entity.id, name: entity.name, isReference: entity.isReference };
}

export function toOwnershipResponse(
  entity: HorseOwnershipEntity,
): HorseOwnershipResponseDto {
  return {
    id: entity.id,
    horseId: entity.horseId,
    ownerId: entity.ownerId,
    ownerName: entity.owner.fullName,
    percentage: entity.percentage,
    startDate: entity.startDate,
    endDate: entity.endDate,
  };
}

export function toLatestMeasurement(
  entity: HorseMeasurementEntity,
): HorseLatestMeasurementDto {
  return {
    type: entity.type,
    value: entity.value,
    unit: HORSE_MEASUREMENT_SPECS[entity.type].unit,
    measuredAt: entity.measuredAt,
  };
}

export function toMeasurementResponse(
  entity: HorseMeasurementEntity,
): HorseMeasurementResponseDto {
  return {
    ...toLatestMeasurement(entity),
    id: entity.id,
    horseId: entity.horseId,
    measuredBy: entity.measuredBy,
    measuredByName: entity.measurer.fullName,
  };
}

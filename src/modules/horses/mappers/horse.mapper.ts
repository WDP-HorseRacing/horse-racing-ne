import { plainToInstance } from 'class-transformer';
import { HORSE_MEASUREMENT_SPECS } from '../constants/horse-measurement-type.enum';
import type {
  HorseLatestMeasurementDto,
  HorseMeasurementResponseDto,
} from '../dto/horse-measure.dto';
import type {
  HorseOwnershipResponseDto,
  HorseParentSummaryDto,
} from '../dto/horse.dto';
import { HorseResponseDto } from '../dto/horse.dto';
import type { HorseMeasurementEntity } from '../entities/horse-measurement.entity';
import type { HorseOwnershipEntity } from '../entities/horse-ownership.entity';
import type { HorseEntity } from '../entities/horse.entity';

export function toHorseResponse(entity: HorseEntity): HorseResponseDto {
  return plainToInstance(HorseResponseDto, entity, {
    excludeExtraneousValues: true,
  });
}

export function toParentSummary(entity: HorseEntity): HorseParentSummaryDto {
  if (!entity) throw new Error('Ngựa không tồn tại');
  return {
    id: entity.id,
    name: entity.name,
    isReference: entity.isReference,
  };
}

export function toOwnershipResponse(
  entity: HorseOwnershipEntity,
): HorseOwnershipResponseDto {
  return {
    id: entity.id,
    horseId: entity.horseId,
    ownerId: entity.ownerId,
    ownerName: requiredRelationName(entity.owner, 'owner'),
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
    id: entity.id,
    horseId: entity.horseId,
    measuredBy: entity.measuredBy,
    measuredByName: requiredRelationName(entity.measurer, 'measurer'),
    ...toLatestMeasurement(entity),
  };
}

function requiredRelationName(
  user: { fullName: string } | null | undefined,
  relation: 'owner' | 'measurer',
): string {
  if (!user) {
    throw new Error(
      `Quan hệ ${relation} chưa được load khi ánh xạ dữ liệu ngựa`,
    );
  }
  return user.fullName;
}

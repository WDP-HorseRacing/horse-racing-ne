import { plainToInstance } from 'class-transformer';
import { HORSE_MEASUREMENT_SPECS } from '../constants/horse.constants';
import type {
  CreatedHorseMeasurementResponseDto,
  HorseLatestMeasurementDto,
  HorseMeasurementResponseDto,
} from '../dto/horse-measure.dto';
import type {
  HorseDetailResponseDto,
  HorseListItemDto,
  HorseOwnershipResponseDto,
  HorseStallSummaryDto,
} from '../dto/horse.dto';
import { HorseResponseDto } from '../dto/horse.dto';
import {
  evaluateEligibility,
  isAbnormalMeasurement,
} from '../policies/horse.policy';
import type { HorseMeasurementEntity } from '../entities/horse-measurement.entity';
import type { HorseOwnershipEntity } from '../entities/horse-ownership.entity';
import type { HorseEntity } from '../entities/horse.entity';
import type {
  HorseCurrentStallRow,
  HorseDetailParts,
  HorseDetailVisibility,
  HorseMeasurementAlertResult,
} from '../types/horse.types';

export function toHorseResponse(entity: HorseEntity): HorseResponseDto {
  return plainToInstance(HorseResponseDto, entity, {
    excludeExtraneousValues: true,
  });
}

/**
 * Map a horse to a list item with its current stall and race registration flag
 * @param horse The horse entity
 * @param location The current stall of the horse, or null if not assigned
 * @param hasActiveTrainingLock Whether the horse has an active training lock
 * @returns The horse list item
 */
export function toHorseListItem(
  horse: HorseEntity,
  location: HorseCurrentStallRow | null,
  hasActiveTrainingLock: boolean,
): HorseListItemDto {
  return {
    ...toHorseResponse(horse),
    stall: location
      ? {
          id: location.stallId,
          code: location.stallCode,
          barn: { id: location.barnId, name: location.barnName },
        }
      : null,
    canRegisterRace: evaluateEligibility({
      isReference: horse.isReference,
      lifecycleStatus: horse.lifecycleStatus,
      healthStatus: horse.healthStatus,
      hasActiveTrainingLock,
    }).racingEligible,
  };
}

/**
 * Chuyển dòng ô chuồng hiện tại của ngựa sang DTO ô chuồng kèm khu chuồng.
 *
 * @param location Ô chuồng hiện tại, hoặc null nếu ngựa chưa được xếp chuồng
 * @returns HorseStallSummaryDto, hoặc null nếu ngựa chưa có chuồng
 */
export function toStallSummary(
  location: HorseCurrentStallRow | null,
): HorseStallSummaryDto | null {
  return location
    ? {
        id: location.stallId,
        code: location.stallCode,
        barn: { id: location.barnId, name: location.barnName },
      }
    : null;
}

/**
 * Dựng phần đầu (header) của hồ sơ ngựa từ dữ liệu đã gom sẵn.
 * Field người gọi không được xem thì bỏ hẳn key, không trả null.
 *
 * @param horse Thực thể ngựa
 * @param parts Ô chuồng, groom, chủ đại diện, chỉ số mới nhất và trạng thái khóa huấn luyện
 * @param visibility Người gọi có được xem sireId/damId và chủ đại diện không
 * @returns HorseDetailResponseDto - Header của hồ sơ ngựa
 */
export function toHorseDetailResponse(
  horse: HorseEntity,
  parts: HorseDetailParts,
  visibility: HorseDetailVisibility,
): HorseDetailResponseDto {
  const { sireId, damId, ...profile } = toHorseResponse(horse);
  return {
    ...profile,
    ...(visibility.includeParents ? { sireId, damId } : {}),
    stall: toStallSummary(parts.stall),
    groom: parts.groom,
    ...(visibility.includeRepresentativeOwner
      ? { representativeOwner: parts.representativeOwner }
      : {}),
    latestMeasurements: parts.latestMeasurements.map(toLatestMeasurement),
    activeTrainingLock: parts.activeTrainingLock,
  };
}

/**
 * Chuyển một dòng sở hữu sang DTO, chỉ thêm email khi người gọi được xem.
 *
 * @param entity Dòng sở hữu, đã load quan hệ owner
 * @param includeEmail Người gọi có được xem email của chủ này không
 * @returns HorseOwnershipResponseDto - không có key ownerEmail khi includeEmail là false
 */
export function toOwnershipResponse(
  entity: HorseOwnershipEntity,
  includeEmail: boolean,
): HorseOwnershipResponseDto {
  return {
    id: entity.id,
    horseId: entity.horseId,
    ownerId: entity.ownerId,
    ownerName: requiredRelationName(entity.owner, 'owner'),
    ...(includeEmail && entity.owner ? { ownerEmail: entity.owner.email } : {}),
    percentage: entity.percentage,
    startAt: entity.startAt,
    endAt: entity.endAt,
    isRepresentative: entity.isRepresentative,
  };
}

/**
 * Chuyển dòng sở hữu của đồng chủ sang DTO rút gọn cho Horse Owner.
 *
 * Chỉ có tên, tỉ lệ và cờ đại diện; không có id, ownerId, email, thời điểm.
 *
 * @param entity Dòng sở hữu đang mở của đồng chủ, đã load quan hệ owner
 * @returns HorseOwnershipResponseDto rút gọn
 */
export function toCoOwnerResponse(
  entity: HorseOwnershipEntity,
): HorseOwnershipResponseDto {
  return {
    ownerName: requiredRelationName(entity.owner, 'owner'),
    percentage: entity.percentage,
    isRepresentative: entity.isRepresentative,
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
    isAbnormal: isAbnormalMeasurement(entity.type, Number(entity.value)),
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

/**
 * Chuyển bản ghi chỉ số vừa tạo kèm các cảnh báo tự động sang DTO trả về cho API ghi.
 *
 * @param entity Bản ghi vừa lưu, đã load quan hệ measurer
 * @param alerts Các cảnh báo tính được cho lần ghi này
 * @returns CreatedHorseMeasurementResponseDto - Bản ghi và cảnh báo; FEVER có baselineValue, dropPercent là null
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

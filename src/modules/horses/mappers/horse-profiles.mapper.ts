import type {
  HorseDetailResponseDto,
  HorseEligibilityResponseDto,
  HorseListItemDto,
  HorseLocationDto,
  HorsePedigreeNodeResponseDto,
  HorsePedigreeResponseDto,
  HorsePermissionsResponseDto,
  HorsePhotoUrlResponseDto,
} from '../dto';
import type { HorseEntity } from '../entities/horse.entity';
import {
  evaluateEligibility,
  placementStatusOf,
} from '../policies/horse.policy';
import { toLatestMeasurement } from './horse-measurements.mapper';
import { toHorseResponse } from './horse.mapper';
import type {
  EligibilityResult,
  HorseDetailParts,
  HorseLocationRow,
  HorsePermissions,
  PedigreeAncestorRow,
} from '../types/horse.types';

/**
 * Chuyển một con ngựa thành một dòng của danh sách (F1.1), kèm vị trí, cờ được đua và cờ đã xóa.
 *
 * @param horse Hồ sơ ngựa
 * @param location Khu và ô hiện tại của ngựa
 * @param hasActiveTrainingLock Ngựa có đang bị khóa huấn luyện không
 * @param hideLocationIds true khi người gọi là Horse Owner: chỉ trả tên khu và mã ô, không trả id
 * @returns Một dòng danh sách ngựa
 */
export function toHorseListItem(
  horse: HorseEntity,
  location: HorseLocationRow,
  hasActiveTrainingLock: boolean,
  hideLocationIds: boolean,
): HorseListItemDto {
  const isDeleted = horse.deletedAt !== null;
  return {
    ...toHorseResponse(horse),
    location: toLocation(horse, location, hideLocationIds),
    canRegisterRace: evaluateEligibility({
      isDeleted,
      lifecycleStatus: horse.lifecycleStatus,
      healthStatus: horse.healthStatus,
      hasActiveTrainingLock,
    }).racingEligible,
    isDeleted,
  };
}

/**
 * Dựng phần vị trí (khu, ô, tình trạng xếp chỗ) của hồ sơ ngựa.
 *
 * - Horse Owner chỉ thấy tên khu và mã ô, không có key id (mục III.6: dữ liệu ngoài quyền không gửi về máy)
 *
 * @param horse Hồ sơ ngựa, dùng vòng đời để tính tình trạng xếp chỗ
 * @param location Khu và ô hiện tại của ngựa
 * @param hideLocationIds true để bỏ id của khu và ô
 * @returns Phần vị trí của hồ sơ
 */
export function toLocation(
  horse: HorseEntity,
  location: HorseLocationRow,
  hideLocationIds: boolean,
): HorseLocationDto {
  return {
    barn:
      location.barnId && location.barnName
        ? {
            ...(hideLocationIds ? {} : { id: location.barnId }),
            name: location.barnName,
          }
        : null,
    stall:
      location.stallId && location.stallCode
        ? {
            ...(hideLocationIds ? {} : { id: location.stallId }),
            code: location.stallCode,
          }
        : null,
    placementStatus: placementStatusOf(
      horse.lifecycleStatus,
      location.barnId,
      location.stallId,
    ),
  };
}

/**
 * Dựng hồ sơ chi tiết (tab 1 của F1.3) từ hồ sơ ngựa và các dữ liệu đã tải sẵn.
 *
 * - Mọi vai trò xem cùng nhóm thông tin; chỉ khác ở chỗ Horse Owner không nhận id khu và ô
 * - "Được tập", "được đua" tính lại tại đây, không lưu DB
 *
 * @param horse Hồ sơ ngựa
 * @param parts Vị trí, groom, chủ sở hữu, chỉ số mới nhất và cờ khóa huấn luyện
 * @param hideLocationIds true khi người gọi là Horse Owner
 * @returns Hồ sơ chi tiết của ngựa
 */
export function toHorseDetailResponse(
  horse: HorseEntity,
  parts: HorseDetailParts,
  hideLocationIds: boolean,
): HorseDetailResponseDto {
  const isDeleted = horse.deletedAt !== null;
  return {
    ...toHorseResponse(horse),
    location: toLocation(horse, parts.location, hideLocationIds),
    groom: parts.groom,
    owner: parts.owner,
    latestMeasurements: parts.latestMeasurements.map(toLatestMeasurement),
    activeTrainingLock: parts.activeTrainingLock,
    eligibility: evaluateEligibility({
      isDeleted,
      lifecycleStatus: horse.lifecycleStatus,
      healthStatus: horse.healthStatus,
      hasActiveTrainingLock: parts.activeTrainingLock,
    }),
    isDeleted,
  };
}

/**
 * Chuyển một dòng tổ tiên thành node của cây phả hệ (F1.3), bỏ ownerId khỏi response.
 *
 * - canOpen = false (Horse Owner xem tổ tiên không thuộc sở hữu của mình): chỉ trả tên và vị trí trong cây, không có key giới tính, giống, màu lông, ngày sinh, sở trường (F1.3.3, mục III.6.2)
 *
 * @param row Dòng tổ tiên từ query phả hệ
 * @param canOpen Người gọi mở được hồ sơ tổ tiên này không
 * @returns Node của cây phả hệ
 */
export function toPedigreeNode(
  row: PedigreeAncestorRow,
  canOpen: boolean,
): HorsePedigreeNodeResponseDto {
  return {
    id: row.id,
    name: row.name,
    ...(canOpen
      ? {
          gender: row.gender,
          breed: row.breed,
          color: row.color,
          dateOfBirth: row.dateOfBirth,
          raceAptitude: row.raceAptitude,
        }
      : {}),
    canOpen,
    generation: row.generation,
    parentRole: row.parentRole,
    childId: row.childId,
  };
}

/**
 * Dựng cây phả hệ (F1.3) từ con ngựa đang xem và các dòng tổ tiên
 *
 * @param horse Con ngựa đang xem
 * @param depth Số đời tổ tiên đã lấy
 * @param ancestors Các node tổ tiên đã chuyển bằng toPedigreeNode
 * @returns Cây phả hệ của ngựa
 */
export function toHorsePedigreeResponse(
  horse: HorseEntity,
  depth: number,
  ancestors: HorsePedigreeNodeResponseDto[],
): HorsePedigreeResponseDto {
  return { horseId: horse.id, horseName: horse.name, depth, ancestors };
}

/**
 * Dựng kết quả "được tập / được đua" (mục III.4) kèm trạng thái hiện tại của ngựa
 *
 * @param horse Hồ sơ ngựa
 * @param activeTrainingLock Ngựa có đang bị khóa huấn luyện không
 * @param result Kết quả tính từ evaluateEligibility
 * @returns Hai cờ, trạng thái hiện tại và lý do chặn
 */
export function toHorseEligibilityResponse(
  horse: HorseEntity,
  activeTrainingLock: boolean,
  result: EligibilityResult,
): HorseEligibilityResponseDto {
  return {
    horseId: horse.id,
    healthStatus: horse.healthStatus,
    lifecycleStatus: horse.lifecycleStatus,
    activeTrainingLock,
    ...result,
  };
}

/**
 * Dựng các cờ quyền của người gọi trên hồ sơ ngựa
 *
 * @param horseId UUID của ngựa
 * @param permissions Các cờ tính từ evaluateHorsePermissions
 * @returns Các cờ quyền kèm id ngựa
 */
export function toHorsePermissionsResponse(
  horseId: string,
  permissions: HorsePermissions,
): HorsePermissionsResponseDto {
  return { horseId, ...permissions };
}

/**
 * Dựng link tải ảnh đại diện của ngựa
 *
 * @param url Presigned GET URL do module media ký
 * @returns Link tải ảnh
 */
export function toHorsePhotoUrlResponse(url: string): HorsePhotoUrlResponseDto {
  return { url };
}

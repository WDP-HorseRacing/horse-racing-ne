import { UserStatus } from '../../../common/enums/user-status.enum';
import type {
  HorseSurchargeResponseDto,
  UnappliedSurchargeResponseDto,
} from '../dto/horse-surcharge.dto';
import type { HorseSurchargeEntity } from '../entities/horse-surcharge.entity';

/**
 * Chuyển một khoản phụ phí của ngựa sang response
 *
 * @param entity Khoản phụ phí, đã tải kèm applier nếu cần tên người xác nhận
 * @returns Response của khoản phụ phí
 */
export function toHorseSurchargeResponse(
  entity: HorseSurchargeEntity,
): HorseSurchargeResponseDto {
  return {
    id: entity.id,
    horseId: entity.horseId,
    description: entity.description,
    dailyAmount: Number(entity.dailyAmount),
    startDate: entity.startDate,
    endDate: entity.endDate,
    createdBy: entity.createdBy,
    createdAt: entity.createdAt,
    appliedBy: entity.appliedBy,
    appliedByName: entity.applier?.fullName ?? null,
    appliedAt: entity.appliedAt,
  };
}

/**
 * Chuyển một khoản phụ phí chưa áp dụng sang dòng của danh sách cho Club Manager, kèm ngựa, khu và Head Trainer phụ trách
 *
 * - Head Trainer của khu không còn hoạt động thì coi như chưa có Head Trainer phụ trách
 *
 * @param entity Khoản phụ phí, đã tải kèm horse, horse.barn, horse.barn.headTrainer
 * @returns Dòng danh sách phụ phí chưa áp dụng
 */
export function toUnappliedSurchargeResponse(
  entity: HorseSurchargeEntity,
): UnappliedSurchargeResponseDto {
  const barn = entity.horse.barn;
  const trainer = barn?.headTrainer ?? null;
  return {
    ...toHorseSurchargeResponse(entity),
    horseName: entity.horse.name,
    barnName: barn?.name ?? null,
    headTrainerName:
      trainer?.status === UserStatus.ACTIVE ? trainer.fullName : null,
  };
}

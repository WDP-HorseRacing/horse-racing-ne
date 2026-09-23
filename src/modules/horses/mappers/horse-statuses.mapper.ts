import type { HorseLifecyclePreviewResponseDto } from '../dto';
import type { HorseEntity } from '../entities/horse.entity';
import {
  HorseHealthStatus,
  HorseLifecycleStatus,
} from '../enums/horse-status.enum';
import type {
  LifecycleImpactRow,
  LifecycleSideEffects,
} from '../types/horse.types';

/**
 * Dựng bảng xem trước hệ quả đổi vòng đời (F1.8 mục 5)
 *
 * - Hệ quả nào không chạy (theo effects) thì trả 0, null hoặc false
 *
 * @param horse Hồ sơ ngựa hiện tại
 * @param to Trạng thái vòng đời muốn chuyển sang
 * @param blockedReason Lý do không được đổi, null nếu được đổi
 * @param effects Các việc sẽ chạy (từ lifecycleSideEffects)
 * @param impact Số liệu hiện tại của ngựa
 * @param summary Câu tóm tắt cho bảng xác nhận, null nếu không được đổi
 * @returns Bảng xem trước hệ quả
 */
export function toLifecyclePreviewResponse(
  horse: HorseEntity,
  to: HorseLifecycleStatus,
  blockedReason: string | null,
  effects: LifecycleSideEffects,
  impact: LifecycleImpactRow,
  summary: string | null,
): HorseLifecyclePreviewResponseDto {
  return {
    horseId: horse.id,
    from: horse.lifecycleStatus,
    to,
    allowed: blockedReason === null,
    blockedReason,
    trainingPlansCancelled: effects.cancelTraining
      ? impact.openTrainingPlans
      : 0,
    raceRegistrationsWithdrawn: effects.withdrawRegistrations
      ? impact.openRaceRegistrations
      : 0,
    stallReleased: effects.releaseStall ? impact.stallCode : null,
    groomEnded: effects.endGroom ? impact.groomName : null,
    barnCleared: effects.clearBarn ? impact.barnName : null,
    trainingLockReleased:
      effects.releaseTrainingLock && impact.hasActiveTrainingLock,
    healthResetTo: effects.resetHealth
      ? HorseHealthStatus.UNDER_OBSERVATION
      : null,
    pendingBarnAfter: effects.reactivateFromTransfer,
    ownerCleared: effects.reactivateFromTransfer
      ? impact.invalidOwnerName
      : null,
    summary,
  };
}

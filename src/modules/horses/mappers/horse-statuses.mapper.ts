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
 * Dữ liệu đầu vào để dựng bảng xem trước hệ quả đổi vòng đời
 */
export interface LifecyclePreviewInput {
  /** Hồ sơ ngựa hiện tại */
  horse: HorseEntity;
  /** Trạng thái vòng đời muốn chuyển sang */
  to: HorseLifecycleStatus;
  /** Lý do không được đổi, null nếu được đổi */
  blockedReason: string | null;
  /** Các việc sẽ chạy (từ lifecycleSideEffects) */
  effects: LifecycleSideEffects;
  /** Số liệu hiện tại của ngựa */
  impact: LifecycleImpactRow;
  /** Câu tóm tắt hệ quả, null nếu không được đổi */
  summary: string | null;
}

/**
 * Dựng bảng xem trước hệ quả đổi vòng đời
 *
 * - Hệ quả nào không chạy (theo effects) thì trả 0, null hoặc false
 *
 * @param input Ngựa, trạng thái đích, lý do chặn, các việc sẽ chạy, số liệu hiện tại và câu tóm tắt
 * @returns Bảng xem trước hệ quả
 */
export function toLifecyclePreviewResponse({
  horse,
  to,
  blockedReason,
  effects,
  impact,
  summary,
}: LifecyclePreviewInput): HorseLifecyclePreviewResponseDto {
  return {
    horseId: horse.id,
    from: horse.lifecycleStatus,
    to,
    allowed: blockedReason === null,
    blockedReason,
    classesWithdrawn: effects.withdrawFromClasses ? impact.activeClasses : 0,
    raceRegistrationsWithdrawn: effects.withdrawRegistrations
      ? impact.openRaceRegistrations
      : 0,
    stallReleased: effects.releaseStall ? impact.stallCode : null,
    groomEnded: effects.endGroom ? impact.groomName : null,
    barnCleared: effects.clearBarn ? impact.barnName : null,
    trainingLockReleased:
      effects.releaseTrainingLock && impact.hasActiveTrainingLock,
    examRequestsDismissed: effects.settleMedicalWork
      ? impact.examRequestsToDismiss
      : 0,
    careSchedulesCancelled: effects.settleMedicalWork
      ? impact.careSchedulesToCancel
      : 0,
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

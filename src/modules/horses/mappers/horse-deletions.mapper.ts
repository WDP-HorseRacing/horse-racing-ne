import type {
  HorseDeletionPreviewResponseDto,
  HorseRestorePreviewResponseDto,
} from '../dto';
import type { HorseEntity } from '../entities/horse.entity';
import { HorseLifecycleStatus } from '../enums/horse-status.enum';
import { restoreImpactSummary } from '../policies/horse.policy';
import type { ParentUsage } from '../types/horse.types';

/**
 * Dựng kết quả xem trước việc xóa hồ sơ ngựa
 *
 * - Xóa được khi ngựa chưa chuyển nhượng, chưa mất, chưa phát sinh dữ liệu nghiệp vụ và không là cha/mẹ của ngựa khác
 *
 * @param horse Hồ sơ ngựa
 * @param businessData Nhãn các loại dữ liệu nghiệp vụ ngựa đã phát sinh
 * @param parentUsage Ngựa có đang là cha hoặc mẹ của ngựa khác không
 * @returns Cờ xóa được và từng lý do chặn
 */
export function toDeletionPreviewResponse(
  horse: HorseEntity,
  businessData: string[],
  parentUsage: ParentUsage,
): HorseDeletionPreviewResponseDto {
  const transferred =
    horse.lifecycleStatus === HorseLifecycleStatus.TRANSFERRED;
  const deceased = horse.lifecycleStatus === HorseLifecycleStatus.DECEASED;
  const isParent = parentUsage.asSire || parentUsage.asDam;
  return {
    horseId: horse.id,
    allowed:
      !transferred && !deceased && businessData.length === 0 && !isParent,
    transferred,
    deceased,
    businessData,
    isParent,
  };
}

/**
 * Dựng kết quả xem trước việc khôi phục hồ sơ đã xóa
 *
 * @param horse Hồ sơ ngựa đã xóa
 * @param barnCleared Tên khu ngựa sẽ rời, null nếu ngựa không có khu
 * @param ownerCleared Tên chủ sẽ bị bỏ trống, null nếu giữ chủ
 * @returns Các hệ quả và câu tóm tắt
 */
export function toRestorePreviewResponse(
  horse: HorseEntity,
  barnCleared: string | null,
  ownerCleared: string | null,
): HorseRestorePreviewResponseDto {
  return {
    horseId: horse.id,
    barnCleared,
    ownerCleared,
    summary: restoreImpactSummary(horse.name, barnCleared, ownerCleared),
  };
}

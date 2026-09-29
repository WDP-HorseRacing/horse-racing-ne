import type { HorseDeletionPreviewResponseDto } from '../dto';
import type { HorseEntity } from '../entities/horse.entity';
import { HorseLifecycleStatus } from '../enums/horse-status.enum';
import type { ParentUsage } from '../types/horse.types';

/**
 * Dựng kết quả xem trước việc xóa hồ sơ ngựa
 *
 * - Xóa được khi ngựa chưa chuyển nhượng, chưa phát sinh dữ liệu nghiệp vụ và không là cha/mẹ của ngựa khác
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
  const isParent = parentUsage.asSire || parentUsage.asDam;
  return {
    horseId: horse.id,
    allowed: !transferred && businessData.length === 0 && !isParent,
    transferred,
    businessData,
    isParent,
  };
}

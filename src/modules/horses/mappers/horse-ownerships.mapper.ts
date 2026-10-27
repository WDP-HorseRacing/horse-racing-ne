import type { HorseOwnershipResponseDto } from '../dto';
import type { HorseOwnershipEntity } from '../entities/horse-ownership.entity';

/**
 * Dựng lịch sử sở hữu của một con ngựa, mới nhất lên trên
 *
 * - Chỉ trả các giai đoạn của `visibleOwnerId` nếu được truyền
 *
 * @param periods Mọi giai đoạn sở hữu của ngựa, đã tải kèm chủ và người ghi nhận
 * @param visibleOwnerId Chỉ giữ giai đoạn của chủ này, null để giữ tất cả
 * @returns Danh sách giai đoạn sở hữu, mới nhất lên trên
 */
export function toOwnershipHistory(
  periods: HorseOwnershipEntity[],
  visibleOwnerId: string | null,
): HorseOwnershipResponseDto[] {
  return periods
    .filter(
      (period) => visibleOwnerId === null || period.ownerId === visibleOwnerId,
    )
    .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime())
    .map((period) => ({
      id: period.id,
      owner: { id: period.owner.id, fullName: period.owner.fullName },
      startedAt: period.startedAt,
      endedAt: period.endedAt,
      reason: period.reason,
      recordedBy: period.recorder
        ? { id: period.recorder.id, fullName: period.recorder.fullName }
        : null,
    }));
}

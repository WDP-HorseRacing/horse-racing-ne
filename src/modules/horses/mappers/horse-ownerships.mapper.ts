import { toClubDate } from '../../../common/utils/club-date';
import type { HorseOwnershipResponseDto } from '../dto';
import type { HorseOwnershipEntity } from '../entities/horse-ownership.entity';

/**
 * Dựng lịch sử sở hữu của một con ngựa, mới nhất lên trên
 *
 * - endDate: ngày hiệu lực của giai đoạn kế tiếp; giai đoạn đã đóng mà không có giai đoạn kế tiếp (chủ bị bỏ trống) lấy ngày kết thúc theo lịch câu lạc bộ; giai đoạn đang mở là null
 * - Chỉ trả các giai đoạn có trong `visibleOwnerId` nếu được truyền, endDate vẫn tính theo toàn bộ lịch sử
 *
 * @param periods Mọi giai đoạn sở hữu của ngựa, đã tải kèm chủ và người ghi nhận, sắp theo thời điểm bắt đầu tăng dần
 * @param visibleOwnerId Chỉ giữ giai đoạn của chủ này, null để giữ tất cả
 * @returns Danh sách giai đoạn sở hữu, mới nhất lên trên
 */
export function toOwnershipHistory(
  periods: HorseOwnershipEntity[],
  visibleOwnerId: string | null,
): HorseOwnershipResponseDto[] {
  return periods
    .map((period, index) => ({ period, next: periods[index + 1] }))
    .filter(
      ({ period }) =>
        visibleOwnerId === null || period.ownerId === visibleOwnerId,
    )
    .map(({ period, next }) => ({
      id: period.id,
      owner: { id: period.owner.id, fullName: period.owner.fullName },
      effectiveDate: period.effectiveDate,
      endDate: next
        ? next.effectiveDate
        : period.endedAt
          ? toClubDate(period.endedAt)
          : null,
      reason: period.reason,
      recordedBy: period.recorder
        ? { id: period.recorder.id, fullName: period.recorder.fullName }
        : null,
      recordedAt: period.startedAt,
    }))
    .reverse();
}

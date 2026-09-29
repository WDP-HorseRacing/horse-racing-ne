import type { HorseBarnPreviewResponseDto } from '../dto';
import type {
  BarnChangeImpactRow,
  BarnPreviewTarget,
} from '../types/horse.types';

/**
 * Dựng kết quả xem trước việc đổi khu
 *
 * - Không đổi được thì các hệ quả trả rỗng và không có câu tóm tắt
 *
 * @param horseId UUID của ngựa
 * @param target Khu đích kèm Head Trainer
 * @param blockedReason Lý do không đổi được, null nếu đổi được
 * @param impact Khu hiện tại, ô, Groom và số lớp sẽ bị ảnh hưởng
 * @param summary Câu tóm tắt, null nếu không đổi được
 * @returns Bảng xem trước hệ quả
 */
export function toBarnPreviewResponse(
  horseId: string,
  target: BarnPreviewTarget,
  blockedReason: string | null,
  impact: BarnChangeImpactRow,
  summary: string | null,
): HorseBarnPreviewResponseDto {
  const allowed = blockedReason === null;
  return {
    horseId,
    allowed,
    blockedReason,
    fromBarnName: impact.fromBarnName,
    toBarnName: target.name,
    newHeadTrainerName: target.headTrainerName,
    stallReleased: allowed ? impact.stallCode : null,
    classesWithdrawn: allowed ? impact.classesToWithdraw : 0,
    groomKept: impact.groomName,
    summary,
  };
}

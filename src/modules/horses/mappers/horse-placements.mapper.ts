import type { GroomAssignmentResponseDto } from '../../stable/dto/groom-assignment.dto';
import type { StallAssignmentResponseDto } from '../../stable/dto/stall.dto';
import type {
  HorseBarnPreviewResponseDto,
  HorsePlacementResponseDto,
} from '../dto';
import type {
  BarnChangeImpactRow,
  BarnPreviewTarget,
} from '../types/horse.types';

/**
 * Dựng kết quả xem trước việc đổi khu
 *
 * - Không đổi được thì các hệ quả trả rỗng và không có câu tóm tắt
 *
 * @param input UUID ngựa, khu đích kèm Head Trainer, lý do không đổi được (null nếu đổi được), các hệ quả (khu hiện tại, ô, Groom, số lớp) và câu tóm tắt (null nếu không đổi được)
 * @returns Bảng xem trước hệ quả
 */
export function toBarnPreviewResponse(input: {
  horseId: string;
  target: BarnPreviewTarget;
  blockedReason: string | null;
  impact: BarnChangeImpactRow;
  summary: string | null;
}): HorseBarnPreviewResponseDto {
  const { horseId, target, blockedReason, impact, summary } = input;
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

/**
 * Dựng kết quả xếp ô kèm giao Groom
 *
 * @param stallAssignment Phân công ô đang mở của ngựa
 * @param groomAssignment Phân công Groom đang mở của ngựa
 * @returns Phân công ô và phân công Groom của ngựa
 */
export function toHorsePlacementResponse(
  stallAssignment: StallAssignmentResponseDto,
  groomAssignment: GroomAssignmentResponseDto,
): HorsePlacementResponseDto {
  return { stallAssignment, groomAssignment };
}

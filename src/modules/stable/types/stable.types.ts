import type { BarnStatus } from '../constants/barn-status.enum';

/**
 * Số ô trống và số ngựa chờ xếp ô của một khu chuồng.
 *
 * - freeStallCount: ô AVAILABLE, chưa xóa và không có phân công đang mở
 * - pendingStallHorseCount: ngựa thuộc khu (horses.barn_id), chưa xóa, khác TRANSFERRED và chưa có ô đang mở
 */
export interface BarnStallCapacity {
  freeStallCount: number;
  pendingStallHorseCount: number;
}

/**
 * Thao tác của Head Trainer trên một con ngựa trong khu, dùng để chọn câu báo lỗi phù hợp.
 *
 * - STALL: xếp hoặc chuyển ô chuồng
 * - GROOM: giao hoặc đổi groom phụ trách
 */
export type StableHorseOperation = 'STALL' | 'GROOM';

/**
 * Trạng thái hiện tại và giá trị mới của khu chuồng mà Club Manager gửi lên, dùng để kiểm luật khu còn ngựa.
 *
 * - Field next* bằng undefined nghĩa là không gửi lên, giữ nguyên
 * - nextHeadTrainerId bằng null nghĩa là gỡ Head Trainer phụ trách
 */
export interface BarnChange {
  hasHorses: boolean;
  currentStatus: BarnStatus;
  nextStatus?: BarnStatus;
  currentHeadTrainerId: string | null;
  nextHeadTrainerId?: string | null;
}

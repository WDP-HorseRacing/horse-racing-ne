/**
 * Tình trạng xếp chỗ của ngựa trong chuồng trại, tính lúc đọc từ khu (horses.barn_id) và ô đang mở.
 *
 * - PENDING_BARN: chưa có khu, nằm trong danh sách "Chờ xếp khu" của Club Manager.
 * - PENDING_STALL: đã có khu nhưng chưa có ô, nằm trong danh sách "Chờ xếp ô" của Head Trainer khu đó.
 * - PLACED: đã có khu và ô.
 * - NOT_APPLICABLE: ngựa đã chuyển nhượng, không còn ở câu lạc bộ.
 */
export enum HorsePlacementStatus {
  PENDING_BARN = 'PENDING_BARN',
  PENDING_STALL = 'PENDING_STALL',
  PLACED = 'PLACED',
  NOT_APPLICABLE = 'NOT_APPLICABLE',
}

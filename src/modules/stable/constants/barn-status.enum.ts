export enum BarnStatus {
  ACTIVE = 'ACTIVE',
  MAINTENANCE = 'MAINTENANCE',
  CLOSED = 'CLOSED',
}

/**
 * Tên hiển thị của từng trạng thái khu chuồng, dùng trong câu báo lỗi
 */
export const BARN_STATUS_LABELS: Record<BarnStatus, string> = {
  [BarnStatus.ACTIVE]: 'Đang hoạt động',
  [BarnStatus.MAINTENANCE]: 'Bảo trì',
  [BarnStatus.CLOSED]: 'Đóng',
};

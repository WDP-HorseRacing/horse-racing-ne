export enum StallStatus {
  AVAILABLE = 'AVAILABLE',
  OCCUPIED = 'OCCUPIED',
  MAINTENANCE = 'MAINTENANCE',
}

/**
 * Tên hiển thị của từng trạng thái ô chuồng, dùng trong câu báo lỗi
 */
export const STALL_STATUS_LABELS: Record<StallStatus, string> = {
  [StallStatus.AVAILABLE]: 'Trống',
  [StallStatus.OCCUPIED]: 'Đang có ngựa',
  [StallStatus.MAINTENANCE]: 'Bảo trì',
};

/**
 * Các trạng thái Club Manager được tự đặt cho ô qua PATCH /stalls/:id. OCCUPIED chỉ do xếp hoặc gỡ ngựa quyết.
 */
export const MANUAL_STALL_STATUSES = [
  StallStatus.AVAILABLE,
  StallStatus.MAINTENANCE,
] as const;

export type ManualStallStatus = (typeof MANUAL_STALL_STATUSES)[number];

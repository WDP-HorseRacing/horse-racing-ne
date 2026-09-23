export enum StallStatus {
  AVAILABLE = 'AVAILABLE',
  OCCUPIED = 'OCCUPIED',
  MAINTENANCE = 'MAINTENANCE',
}

/**
 * Các trạng thái Club Manager được tự đặt cho ô qua PATCH /stalls/:id. OCCUPIED chỉ do xếp hoặc gỡ ngựa quyết.
 */
export const MANUAL_STALL_STATUSES = [
  StallStatus.AVAILABLE,
  StallStatus.MAINTENANCE,
] as const;

export type ManualStallStatus = (typeof MANUAL_STALL_STATUSES)[number];

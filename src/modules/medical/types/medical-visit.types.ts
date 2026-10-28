import type { HorseHealthStatus } from '../../horses/enums/horse-status.enum';

/**
 * Một lần đổi trạng thái sức khỏe xảy ra sau một buổi khám, đọc từ nhật ký.
 */
export interface LaterHealthChange {
  changedAt: Date;
  changedBy: string | null;
  to: HorseHealthStatus;
}

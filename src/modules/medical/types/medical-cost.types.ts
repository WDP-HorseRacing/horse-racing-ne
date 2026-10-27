import type { OwnershipPeriod } from '../../horses/types/horse.types';

/**
 * Quyền xem chi phí y tế của người gọi trên một con ngựa.
 *
 * - seesCost false: không có key chi phí (Head Trainer)
 * - owner khác null: người gọi xem theo phạm vi Horse Owner, chỉ thấy chi phí của buổi khám thuộc giai đoạn mình sở hữu
 */
export interface MedicalCostViewer {
  seesCost: boolean;
  owner: { ownerId: string; periods: OwnershipPeriod[] } | null;
}

import type { SupplyRequestStatus } from '../enums/supply-request-status.enum';

/**
 * Payload của domain event SUPPLY_REQUEST_CREATED_EVENT
 *
 * - eventId: id của đề xuất
 */
export interface SupplyRequestCreatedEvent {
  eventId: string;
  requestId: string;
  itemName: string;
  unit: string;
  quantity: number;
  requesterName: string;
}

/**
 * Payload của domain event SUPPLY_REQUEST_STATUS_CHANGED_EVENT
 *
 * - eventId: UUID suy ra cố định từ id đề xuất và trạng thái mới
 * - reason: lý do từ chối, null với trạng thái khác
 */
export interface SupplyRequestStatusChangedEvent {
  eventId: string;
  requestId: string;
  requesterId: string;
  itemName: string;
  unit: string;
  quantity: number;
  status: SupplyRequestStatus;
  reason: string | null;
}

/**
 * Payload của domain event SUPPLY_LOW_STOCK_EVENT
 *
 * - eventId: UUID sinh lúc phát, mỗi lần số tồn xuống qua ngưỡng một event
 */
export interface SupplyLowStockEvent {
  eventId: string;
  itemId: string;
  itemName: string;
  unit: string;
  quantityOnHand: number;
  reorderThreshold: number;
}

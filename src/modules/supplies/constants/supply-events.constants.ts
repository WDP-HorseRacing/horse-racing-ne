/**
 * Tên domain event phát khi Groom hoặc Head Trainer gửi đề xuất bổ sung vật tư.
 * Payload là SupplyRequestCreatedEvent; module notifications nghe event này để báo Club Manager.
 */
export const SUPPLY_REQUEST_CREATED_EVENT = 'supplies.request.created';

/**
 * Tên domain event phát khi Club Manager duyệt, từ chối, cấp hoặc hủy một đề xuất bổ sung.
 * Payload là SupplyRequestStatusChangedEvent; module notifications nghe event này để báo người gửi.
 */
export const SUPPLY_REQUEST_STATUS_CHANGED_EVENT =
  'supplies.request.status-changed';

/**
 * Tên domain event phát khi xuất dùng làm số tồn của vật tư xuống tới hoặc dưới ngưỡng báo thiếu.
 * Payload là SupplyLowStockEvent; module notifications nghe event này để báo Club Manager.
 */
export const SUPPLY_LOW_STOCK_EVENT = 'supplies.item.low-stock';

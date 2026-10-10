/**
 * Lý do một lần đổi số tồn vật tư
 *
 * - RESTOCK: Club Manager cấp hàng theo đề xuất bổ sung
 * - COUNT_ADJUST: kiểm kê, hoặc số tồn ban đầu khi thêm vật tư
 */
export enum SupplyStockMovementType {
  RESTOCK = 'RESTOCK',
  COUNT_ADJUST = 'COUNT_ADJUST',
}

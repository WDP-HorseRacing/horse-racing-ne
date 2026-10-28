/**
 * Lý do một lần đổi số tồn vật tư
 *
 * - OPENING: số tồn ban đầu khi thêm vật tư, tạo một lô
 * - RESTOCK: Club Manager nhập hàng, trực tiếp hoặc cấp theo đề xuất bổ sung, tạo một lô
 * - USAGE: lấy hàng ra dùng, trừ các lô nhập sớm nhất trước
 * - USAGE_REVERSAL: hủy một lần xuất, cộng trả đúng lô đã trừ
 * - COUNT_ADJUST: chênh lệch kiểm kê, chỉ có ở dữ liệu cũ, không gắn lô
 */
export enum SupplyStockMovementType {
  OPENING = 'OPENING',
  RESTOCK = 'RESTOCK',
  USAGE = 'USAGE',
  USAGE_REVERSAL = 'USAGE_REVERSAL',
  COUNT_ADJUST = 'COUNT_ADJUST',
}

/**
 * Lọc ra các field có giá trị mới khác giá trị đang lưu.
 *
 * - Field có giá trị undefined được coi là không gửi lên, bỏ qua
 * - So sánh bằng ===, nên chỉ dùng cho giá trị đơn (string, number, enum, null)
 *
 * @param current Bản ghi đang lưu
 * @param next Các giá trị mới người gọi gửi lên
 * @returns Chỉ các field thực sự đổi, kèm giá trị mới
 */
export function changedFields<T extends object>(
  current: T,
  next: Partial<T>,
): Partial<T> {
  const changes: Partial<T> = {};
  for (const key of Object.keys(next) as Array<keyof T>) {
    if (next[key] !== undefined && next[key] !== current[key]) {
      changes[key] = next[key];
    }
  }
  return changes;
}

/**
 * Lấy giá trị hiện tại của các field được chỉ định, dùng làm dữ liệu "trước" cho nhật ký.
 *
 * @param record Bản ghi cần lấy giá trị
 * @param keys Tên các field cần lấy
 * @returns Object chỉ gồm các field đã chỉ định
 */
export function pickFields(
  record: object,
  keys: string[],
): Record<string, unknown> {
  const values = record as Record<string, unknown>;
  return Object.fromEntries(keys.map((key) => [key, values[key]]));
}

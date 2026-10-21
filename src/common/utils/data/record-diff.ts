/**
 * Lọc ra các field có giá trị mới khác giá trị đang lưu, kèm giá trị cũ để ghi nhật ký
 *
 * - Field có giá trị undefined được coi là không gửi lên, bỏ qua
 * - So sánh bằng ===, chỉ dùng cho giá trị đơn (string, number, enum, null)
 *
 * @param current Bản ghi đang lưu
 * @param next Các giá trị mới người gọi gửi lên
 * @returns Cặp before/after chỉ gồm các field thực sự đổi, hoặc null nếu không field nào đổi
 */
export function changedFieldsDiff<T extends object>(
  current: T,
  next: Partial<T>,
): { before: Partial<T>; after: Partial<T> } | null {
  const before: Partial<T> = {};
  const after: Partial<T> = {};
  for (const key of Object.keys(next) as Array<keyof T>) {
    if (next[key] !== undefined && next[key] !== current[key]) {
      before[key] = current[key];
      after[key] = next[key];
    }
  }
  return Object.keys(after).length === 0 ? null : { before, after };
}

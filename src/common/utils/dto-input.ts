/**
 * Chuỗi ngày theo lịch, không kèm giờ (YYYY-MM-DD).
 */
export const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Cắt khoảng trắng hai đầu nếu giá trị là chuỗi, dùng cho @Transform của các ô văn bản
 *
 * @param params Tham số của class-transformer
 * @returns Chuỗi đã cắt, hoặc giá trị gốc nếu không phải chuỗi
 */
export function trimValue({ value }: { value: unknown }): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

/**
 * Đổi giá trị query lặp tham số (`status=A&status=B`) thành mảng, dùng trong `@Transform` của DTO
 *
 * - Mảng: giữ nguyên
 * - Một giá trị đơn: bọc thành mảng một phần tử
 * - undefined: giữ nguyên để `@IsOptional` bỏ qua
 *
 * @param params Tham số class-transformer truyền vào, chỉ dùng `value`
 * @returns Mảng giá trị, hoặc undefined nếu không truyền
 */
export function toQueryArray({ value }: { value: unknown }): unknown {
  if (value === undefined || Array.isArray(value)) return value;
  return [value];
}

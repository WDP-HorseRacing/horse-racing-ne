/**
 * Đổi giá trị query "true"/"false" thành boolean, dùng trong `@Transform` của DTO
 *
 * - "true" hoặc true: true; "false" hoặc false: false
 * - Giá trị khác giữ nguyên để class-validator (`@IsBoolean`) từ chối
 *
 * @param params Tham số class-transformer truyền vào, chỉ dùng `value`
 * @returns true, false hoặc chính giá trị ban đầu nếu không nhận ra
 */
export function toQueryBoolean({ value }: { value: unknown }): unknown {
  if (value === true || value === 'true') return true;
  if (value === false || value === 'false') return false;
  return value;
}

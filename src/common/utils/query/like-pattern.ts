/**
 * Tạo mẫu LIKE/ILIKE tìm chuỗi con, coi `%`, `_` và `\` trong từ khóa là ký tự thường
 *
 * - Dùng với ký tự escape mặc định của Postgres (`\`)
 *
 * @param search Từ khóa người dùng nhập
 * @returns Mẫu dạng `%từ khóa%` đã escape
 */
export function containsPattern(search: string): string {
  return `%${search.replace(/[\\%_]/g, '\\$&')}%`;
}

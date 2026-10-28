import { createHash } from 'crypto';

/**
 * Sinh UUID cố định (dạng UUID v5, băm SHA-1) từ một chuỗi khóa, cùng khóa luôn ra cùng UUID
 *
 * - Dùng làm event_id của thông báo sinh định kỳ để unique index (event_id, recipient_id) chặn gửi trùng
 *
 * @param key Chuỗi khóa nghiệp vụ, ví dụ `checkup-overdue:<horseId>:<dueDate>`
 * @returns UUID dạng chuỗi 36 ký tự
 */
export function deterministicUuid(key: string): string {
  const hex = createHash('sha1').update(key).digest('hex').slice(0, 32);
  const variant = ((parseInt(hex[16], 16) & 0x3) | 0x8).toString(16);
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    `5${hex.slice(13, 16)}`,
    `${variant}${hex.slice(17, 20)}`,
    hex.slice(20, 32),
  ].join('-');
}

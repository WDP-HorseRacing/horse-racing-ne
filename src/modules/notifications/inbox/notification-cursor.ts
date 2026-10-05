import { BadRequestException } from '@nestjs/common';

/**
 * Vị trí của thông báo cuối cùng trong trang trước.
 */
export interface NotificationCursor {
  createdAt: Date;
  id: string;
}

const SEPARATOR = '|';

/**
 * Mã hóa vị trí thông báo cuối trang thành chuỗi cursor (base64url của `createdAt|id`)
 *
 * @param cursor Thời điểm tạo và id của thông báo cuối trang
 * @returns Chuỗi cursor trả cho client
 */
export function encodeNotificationCursor(cursor: NotificationCursor): string {
  return Buffer.from(
    `${cursor.createdAt.toISOString()}${SEPARATOR}${cursor.id}`,
  ).toString('base64url');
}

/**
 * Giải mã chuỗi cursor do client gửi lên
 *
 * @param value Chuỗi cursor (giá trị nextCursor của trang trước)
 * @returns Thời điểm tạo và id của thông báo cuối trang trước
 * @throws BadRequestException Nếu cursor sai định dạng
 */
export function decodeNotificationCursor(value: string): NotificationCursor {
  const decoded = Buffer.from(value, 'base64url').toString('utf8');
  const separatorAt = decoded.indexOf(SEPARATOR);
  const createdAt = new Date(decoded.slice(0, separatorAt));
  const id = decoded.slice(separatorAt + 1);
  if (separatorAt <= 0 || Number.isNaN(createdAt.getTime()) || !id) {
    throw new BadRequestException('Cursor không hợp lệ');
  }
  return { createdAt, id };
}

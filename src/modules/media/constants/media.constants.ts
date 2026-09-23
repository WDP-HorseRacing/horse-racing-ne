import { UserRole } from '../../../common/enums/role.enum';
import { MediaPurpose } from '../enums/media-purpose.enum';

/** Các định dạng ảnh đại diện ngựa được chấp nhận (F1.2 mục 8). */
export const HORSE_PHOTO_ALLOWED_MIME_TYPES: readonly string[] = [
  'image/jpeg',
  'image/png',
  'image/webp',
];

/** Dung lượng tối đa của ảnh đại diện ngựa: 10 MB (F1.2 mục 8). */
export const HORSE_PHOTO_MAX_BYTES = 10 * 1024 * 1024;

/** Thư mục gốc trên bucket cho từng mục đích tải lên. */
export const MEDIA_OBJECT_KEY_PREFIX: Readonly<Record<MediaPurpose, string>> = {
  [MediaPurpose.HORSE_PHOTO]: 'horse-photos',
};

/** Đuôi tệp dùng khi đặt object key, suy ra từ mime type đã được chấp nhận. */
export const MEDIA_FILE_EXTENSION: Readonly<Record<string, string>> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

/**
 * Quyền xin tải lên theo từng mục đích: vai trò nào được tải và message 403 khi bị từ chối.
 *
 * - HORSE_PHOTO: chỉ Club Manager (BA chốt).
 * - Thêm mục đích mới (video time trial, ảnh sự cố...) thì khai báo vai trò ở đây.
 */
export const MEDIA_UPLOAD_PERMISSION: Readonly<
  Record<MediaPurpose, { roles: readonly UserRole[]; deniedMessage: string }>
> = {
  [MediaPurpose.HORSE_PHOTO]: {
    roles: [UserRole.CLUB_MANAGER],
    deniedMessage: 'Chỉ Quản lý câu lạc bộ được tải lên ảnh đại diện ngựa',
  },
};

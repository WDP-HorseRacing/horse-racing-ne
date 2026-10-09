import { UserRole } from '../../../common/enums/role.enum';
import { MediaPurpose } from '../enums/media-purpose.enum';

/** Các định dạng ảnh đại diện ngựa được chấp nhận. */
export const HORSE_PHOTO_ALLOWED_MIME_TYPES: readonly string[] = [
  'image/jpeg',
  'image/png',
  'image/webp',
];

/** Dung lượng tối đa của ảnh đại diện ngựa: 10 MB. */
export const HORSE_PHOTO_MAX_BYTES = 10 * 1024 * 1024;

/** Các định dạng video chạy thử được chấp nhận. */
export const TRIAL_VIDEO_ALLOWED_MIME_TYPES: readonly string[] = [
  'video/mp4',
  'video/webm',
  'video/quicktime',
];

/** Dung lượng tối đa của video chạy thử: 200 MB. */
export const TRIAL_VIDEO_MAX_BYTES = 200 * 1024 * 1024;

/** Thư mục gốc trên bucket cho từng mục đích tải lên. */
export const MEDIA_OBJECT_KEY_PREFIX: Readonly<Record<MediaPurpose, string>> = {
  [MediaPurpose.HORSE_PHOTO]: 'horse-photos',
  [MediaPurpose.TRIAL_VIDEO]: 'trial-videos',
};

/** Đuôi tệp dùng khi đặt object key, suy ra từ mime type đã được chấp nhận. */
export const MEDIA_FILE_EXTENSION: Readonly<Record<string, string>> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/quicktime': 'mov',
};

/**
 * Quyền xin tải lên theo từng mục đích: vai trò nào được tải và message 403 khi bị từ chối.
 *
 * - HORSE_PHOTO: chỉ Club Manager.
 * - TRIAL_VIDEO: chỉ Head Trainer.
 */
export const MEDIA_UPLOAD_PERMISSION: Readonly<
  Record<MediaPurpose, { roles: readonly UserRole[]; deniedMessage: string }>
> = {
  [MediaPurpose.HORSE_PHOTO]: {
    roles: [UserRole.CLUB_MANAGER],
    deniedMessage: 'Chỉ Quản lý câu lạc bộ được tải lên ảnh đại diện ngựa',
  },
  [MediaPurpose.TRIAL_VIDEO]: {
    roles: [UserRole.HEAD_TRAINER],
    deniedMessage: 'Chỉ Huấn luyện viên trưởng được tải lên video chạy thử',
  },
};

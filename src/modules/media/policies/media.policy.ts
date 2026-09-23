import { BadRequestException, ForbiddenException } from '@nestjs/common';
import type { Actor } from '../../../common/types/actor';
import {
  HORSE_PHOTO_ALLOWED_MIME_TYPES,
  HORSE_PHOTO_MAX_BYTES,
  MEDIA_FILE_EXTENSION,
  MEDIA_OBJECT_KEY_PREFIX,
  MEDIA_UPLOAD_PERMISSION,
} from '../constants/media.constants';
import { MediaPurpose } from '../enums/media-purpose.enum';

/**
 * Chuẩn hóa content type: bỏ tham số phía sau dấu `;`, bỏ khoảng trắng và đưa về chữ thường.
 *
 * @param contentType Content type thô, ví dụ `image/JPEG; charset=binary`
 * @returns Content type đã chuẩn hóa, ví dụ `image/jpeg`
 */
export function normalizeContentType(contentType: string): string {
  return contentType.split(';')[0].trim().toLowerCase();
}

/**
 * Kiểm tra định dạng và dung lượng của ảnh đại diện ngựa theo F1.2 mục 8.
 *
 * - Định dạng: JPEG, PNG hoặc WebP.
 * - Dung lượng: lớn hơn 0 và không quá 10 MB.
 * - Dùng cả khi xin tải lên (số liệu khai báo), khi xác nhận tải xong (số liệu thật trên storage) và khi module horses gắn ảnh.
 *
 * @param mimeType Mime type của tệp
 * @param byteSize Dung lượng tệp tính bằng byte
 * @throws BadRequestException Nếu sai định dạng hoặc vượt dung lượng cho phép
 */
export function assertHorsePhotoSpec(mimeType: string, byteSize: number): void {
  if (
    !HORSE_PHOTO_ALLOWED_MIME_TYPES.includes(normalizeContentType(mimeType))
  ) {
    throw new BadRequestException(
      'Ảnh đại diện phải có định dạng JPEG, PNG hoặc WebP',
    );
  }
  if (!Number.isFinite(byteSize) || byteSize <= 0) {
    throw new BadRequestException('Dung lượng ảnh không hợp lệ');
  }
  if (byteSize > HORSE_PHOTO_MAX_BYTES) {
    throw new BadRequestException('Ảnh đại diện không được vượt quá 10 MB');
  }
}

/**
 * Kiểm tra tệp theo giới hạn của mục đích sử dụng.
 *
 * @param purpose Mục đích sử dụng của tệp
 * @param mimeType Mime type của tệp
 * @param byteSize Dung lượng tệp tính bằng byte
 * @throws BadRequestException Nếu tệp không đạt giới hạn của mục đích đó
 */
export function assertMediaSpec(
  purpose: MediaPurpose,
  mimeType: string,
  byteSize: number,
): void {
  switch (purpose) {
    case MediaPurpose.HORSE_PHOTO:
      assertHorsePhotoSpec(mimeType, byteSize);
      return;
  }
}

/**
 * Tạo object key trên bucket cho một tệp mới: `<thư mục của mục đích>/<assetId>.<đuôi>`.
 *
 * - Không dùng tên tệp người dùng gửi lên để tránh ký tự lạ hoặc đường dẫn `..`.
 * - Đuôi tệp suy ra từ mime type, nên chỉ gọi sau khi mime type đã qua assertMediaSpec.
 *
 * @param purpose Mục đích sử dụng của tệp
 * @param assetId UUID của bản ghi media_assets
 * @param mimeType Mime type đã được chấp nhận
 * @returns Object key tương đối trong bucket
 */
export function buildMediaObjectKey(
  purpose: MediaPurpose,
  assetId: string,
  mimeType: string,
): string {
  const extension = MEDIA_FILE_EXTENSION[normalizeContentType(mimeType)];
  const fileName = extension ? `${assetId}.${extension}` : assetId;
  return `${MEDIA_OBJECT_KEY_PREFIX[purpose]}/${fileName}`;
}

/**
 * Suy ra mục đích sử dụng từ thư mục gốc của object key (bảng media_assets chưa có cột purpose).
 *
 * @param objectKey Object key đã lưu trong media_assets
 * @returns Mục đích tương ứng, hoặc undefined nếu key không thuộc thư mục nào đã biết
 */
export function mediaPurposeOfObjectKey(
  objectKey: string,
): MediaPurpose | undefined {
  const prefix = objectKey.split('/')[0];
  return Object.values(MediaPurpose).find(
    (purpose) => MEDIA_OBJECT_KEY_PREFIX[purpose] === prefix,
  );
}

/**
 * Kiểm tra người gọi có được xin tải lên tệp cho mục đích này không, theo bảng MEDIA_UPLOAD_PERMISSION.
 *
 * - HORSE_PHOTO: chỉ CLUB_MANAGER.
 * - Kiểm theo vai trò trong Access Token (actor.roles), giống các policy khác.
 *
 * @param actor Thông tin danh tính từ Access Token
 * @param purpose Mục đích sử dụng của tệp
 * @throws ForbiddenException Nếu người gọi không có vai trò nào được phép tải lên cho mục đích đó
 */
export function assertCanUploadMedia(
  actor: Actor,
  purpose: MediaPurpose,
): void {
  const { roles, deniedMessage } = MEDIA_UPLOAD_PERMISSION[purpose];
  if (!roles.some((role) => actor.roles.includes(role))) {
    throw new ForbiddenException(deniedMessage);
  }
}

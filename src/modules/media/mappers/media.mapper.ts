import { MediaAssetResponseDto, MediaUploadRequestResponseDto } from '../dto';
import { MediaAssetEntity } from '../entities/media-asset.entity';

/**
 * Chuyển bản ghi media_assets sang DTO trả về client. Cột byte_size kiểu bigint được TypeORM trả về dạng chuỗi nên đổi sang number.
 *
 * @param asset Bản ghi media_assets
 * @returns MediaAssetResponseDto - Metadata của tệp, không lộ object key
 */
export function toMediaAssetResponse(
  asset: MediaAssetEntity,
): MediaAssetResponseDto {
  return {
    id: asset.id,
    uploadedBy: asset.uploadedBy,
    mimeType: asset.mimeType,
    byteSize: Number(asset.byteSize),
    createdAt: asset.createdAt,
  };
}

/**
 * Tạo DTO trả về cho yêu cầu tải lên, kèm các header client bắt buộc gửi khi PUT lên presigned URL.
 *
 * @param asset Bản ghi media_assets vừa tạo
 * @param uploadUrl Presigned PUT URL
 * @returns MediaUploadRequestResponseDto - Thông tin để client tải tệp lên storage
 */
export function toMediaUploadRequestResponse(
  asset: MediaAssetEntity,
  uploadUrl: string,
): MediaUploadRequestResponseDto {
  return {
    assetId: asset.id,
    uploadUrl,
    method: 'PUT',
    headers: {
      'Content-Type': asset.mimeType,
      'Content-Length': String(asset.byteSize),
    },
  };
}

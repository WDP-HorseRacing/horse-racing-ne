import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DataSource, EntityManager } from 'typeorm';
import { ObjectStorageService } from '../../../common/infrastructure/storage/object-storage.service';
import type { Actor } from '../../../common/types/actor';
import { currentUserForActor } from '../../users/utils/current-user';
import {
  MediaAssetResponseDto,
  MediaDownloadUrlResponseDto,
  MediaUploadRequestResponseDto,
  RequestUploadDto,
} from '../dto';
import { MediaAssetEntity } from '../entities/media-asset.entity';
import { MediaPurpose } from '../enums/media-purpose.enum';
import {
  toMediaAssetResponse,
  toMediaUploadRequestResponse,
} from '../mappers/media.mapper';
import {
  assertCanUploadMedia,
  assertMediaSpec,
  buildMediaObjectKey,
  mediaPurposeOfObjectKey,
  normalizeContentType,
} from '../policies/media.policy';

@Injectable()
export class MediaService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly storage: ObjectStorageService,
  ) {}

  /**
   * Tạo yêu cầu tải tệp lên: kiểm tra số liệu khai báo, lưu bản ghi media_assets và cấp presigned PUT URL.
   *
   * - Vai trò được xin tải lên tùy mục đích, theo MEDIA_UPLOAD_PERMISSION (ảnh ngựa: chỉ CLUB_MANAGER).
   * - Mime type và dung lượng khai báo phải đạt giới hạn của mục đích (ảnh ngựa: JPEG/PNG/WebP, tối đa 10 MB).
   * - Presigned URL ký kèm Content-Type và Content-Length, nên storage từ chối nếu client gửi tệp khác khai báo.
   * - Tệp chỉ dùng được sau khi gọi complete, hoặc khi module khác xác minh lại qua assertAttachableHorsePhoto.
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param body Mục đích, tên tệp, mime type và dung lượng khai báo
   * @returns A promise resolving to MediaUploadRequestResponseDto - assetId, presigned URL và header bắt buộc khi PUT
   * @throws ForbiddenException Nếu tài khoản không tồn tại, không hoạt động, chưa có vai trò hoặc vai trò không được tải lên cho mục đích này
   * @throws BadRequestException Nếu mime type hoặc dung lượng khai báo không đạt giới hạn của mục đích
   */
  async requestUpload(
    actor: Actor,
    body: RequestUploadDto,
  ): Promise<MediaUploadRequestResponseDto> {
    const caller = await currentUserForActor(this.dataSource.manager, actor);
    assertCanUploadMedia(actor, body.purpose);
    const mimeType = normalizeContentType(body.mimeType);
    assertMediaSpec(body.purpose, mimeType, body.byteSize);

    const assetId = randomUUID();
    const objectKey = buildMediaObjectKey(body.purpose, assetId, mimeType);
    const uploadUrl = await this.storage.createUploadUrl(
      objectKey,
      mimeType,
      body.byteSize,
    );
    const asset = await this.dataSource.manager.save(
      this.dataSource.manager.create(MediaAssetEntity, {
        id: assetId,
        uploadedBy: caller.id,
        objectKey,
        mimeType,
        byteSize: String(body.byteSize),
      }),
    );
    return toMediaUploadRequestResponse(asset, uploadUrl);
  }

  /**
   * Xác nhận client đã tải tệp lên xong: đọc metadata thật trên storage (HEAD object) và so với số liệu đã khai báo.
   *
   * - Chỉ người tạo yêu cầu tải lên được xác nhận; người khác nhận 404 để không lộ tệp có tồn tại.
   * - Gọi lại nhiều lần vẫn an toàn, mỗi lần đều kiểm lại trên storage.
   * - Tệp sai giới hạn vẫn nằm trên storage, không bị xóa ở bước này.
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param assetId UUID của bản ghi media_assets
   * @returns A promise resolving to MediaAssetResponseDto - Metadata của tệp đã xác nhận
   * @throws ForbiddenException Nếu tài khoản không tồn tại, không hoạt động hoặc chưa có vai trò
   * @throws NotFoundException Nếu không có tệp hoặc người gọi không phải người tải lên
   * @throws ConflictException Nếu tệp chưa có trên storage
   * @throws BadRequestException Nếu tệp thật sai định dạng, vượt dung lượng hoặc không khớp số liệu khai báo
   */
  async complete(
    actor: Actor,
    assetId: string,
  ): Promise<MediaAssetResponseDto> {
    const caller = await currentUserForActor(this.dataSource.manager, actor);
    const asset = await this.findAsset(this.dataSource.manager, assetId);
    if (asset.uploadedBy !== caller.id) {
      throw new NotFoundException('Không tìm thấy tệp');
    }
    await this.verifyStoredObject(asset, this.purposeOf(asset));
    return toMediaAssetResponse(asset);
  }

  /**
   * Lấy metadata của tệp do chính người gọi tải lên.
   *
   * - Module sở hữu dữ liệu tự cấp link cho người được xem (vd ảnh ngựa qua GET /horses/{id}/photo-url), media không tự quyết quyền xem theo nghiệp vụ
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param assetId UUID của bản ghi media_assets
   * @returns A promise resolving to MediaAssetResponseDto - Metadata của tệp
   * @throws ForbiddenException Nếu tài khoản không tồn tại, không hoạt động hoặc chưa có vai trò
   * @throws NotFoundException Nếu không có tệp hoặc người gọi không được xem
   */
  async getMetadata(
    actor: Actor,
    assetId: string,
  ): Promise<MediaAssetResponseDto> {
    const asset = await this.findViewableAsset(actor, assetId);
    return toMediaAssetResponse(asset);
  }

  /**
   * Cấp presigned GET URL có hạn dùng để tải tệp do chính người gọi tải lên.
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param assetId UUID của bản ghi media_assets
   * @returns A promise resolving to MediaDownloadUrlResponseDto - URL tải tệp
   * @throws ForbiddenException Nếu tài khoản không tồn tại, không hoạt động hoặc chưa có vai trò
   * @throws NotFoundException Nếu không có tệp hoặc người gọi không được xem
   */
  async createDownloadUrl(
    actor: Actor,
    assetId: string,
  ): Promise<MediaDownloadUrlResponseDto> {
    const asset = await this.findViewableAsset(actor, assetId);
    const url = await this.storage.createDownloadUrl(asset.objectKey);
    return { url };
  }

  /**
   * Cấp presigned GET URL có hạn dùng cho một tệp, không kiểm quyền xem. Dành cho module sở hữu dữ liệu gọi sau khi đã tự kiểm quyền (vd horses cấp link ảnh ngựa)
   *
   * @param assetId UUID của bản ghi media_assets
   * @returns A promise resolving to URL tải tệp
   * @throws NotFoundException Nếu không có tệp
   */
  async signDownloadUrl(assetId: string): Promise<string> {
    const asset = await this.findAsset(this.dataSource.manager, assetId);
    return this.storage.createDownloadUrl(asset.objectKey);
  }

  /**
   * Kiểm tra một tệp có được gắn làm ảnh đại diện ngựa không. Dành cho module horses gọi TRƯỚC khi mở transaction tạo hoặc đổi ảnh.
   *
   * - Tệp phải do chính người gọi tải lên, để không gắn được tệp riêng của người khác vào hồ sơ ngựa.
   * - Tệp phải được xin tải lên với mục đích HORSE_PHOTO.
   * - Metadata thật trên storage phải đạt giới hạn ảnh ngựa và khớp số liệu khai báo (vì bảng media_assets chưa lưu trạng thái đã xác nhận).
   * - Có một lần gọi HEAD tới storage, nên không gọi trong transaction để không giữ connection DB trong lúc chờ mạng.
   * - Bản ghi media_assets không bao giờ bị sửa sau khi tạo, nên kiểm trước transaction vẫn đúng lúc ghi.
   *
   * @param callerId UUID của người gọi (users.id)
   * @param assetId UUID của bản ghi media_assets
   * @returns A promise resolving to MediaAssetEntity - Tệp hợp lệ để gắn làm ảnh
   * @throws NotFoundException Nếu không có tệp hoặc tệp không do người gọi tải lên
   * @throws BadRequestException Nếu tệp không phải ảnh ngựa, sai định dạng, vượt dung lượng hoặc không khớp số liệu khai báo
   * @throws ConflictException Nếu tệp chưa có trên storage
   */
  async assertAttachableHorsePhoto(
    callerId: string,
    assetId: string,
  ): Promise<MediaAssetEntity> {
    const asset = await this.findAsset(this.dataSource.manager, assetId);
    if (asset.uploadedBy !== callerId) {
      throw new NotFoundException('Không tìm thấy tệp');
    }
    if (mediaPurposeOfObjectKey(asset.objectKey) !== MediaPurpose.HORSE_PHOTO) {
      throw new BadRequestException('Tệp không phải ảnh đại diện ngựa');
    }
    await this.verifyStoredObject(asset, MediaPurpose.HORSE_PHOTO);
    return asset;
  }

  /**
   * Lấy bản ghi media_assets theo id.
   *
   * @param manager EntityManager dùng để query
   * @param assetId UUID của bản ghi media_assets
   * @returns A promise resolving to MediaAssetEntity
   * @throws NotFoundException Nếu không có tệp
   */
  private async findAsset(
    manager: EntityManager,
    assetId: string,
  ): Promise<MediaAssetEntity> {
    const asset = await manager.findOneBy(MediaAssetEntity, { id: assetId });
    if (!asset) {
      throw new NotFoundException('Không tìm thấy tệp');
    }
    return asset;
  }

  /**
   * Lấy tệp do chính người gọi tải lên.
   *
   * - Người khác nhận 404 để không lộ tệp có tồn tại.
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param assetId UUID của bản ghi media_assets
   * @returns A promise resolving to MediaAssetEntity - Tệp người gọi được xem
   * @throws ForbiddenException Nếu tài khoản không tồn tại, không hoạt động hoặc chưa có vai trò
   * @throws NotFoundException Nếu không có tệp hoặc người gọi không được xem
   */
  private async findViewableAsset(
    actor: Actor,
    assetId: string,
  ): Promise<MediaAssetEntity> {
    const manager = this.dataSource.manager;
    const caller = await currentUserForActor(manager, actor);
    const asset = await this.findAsset(manager, assetId);
    if (asset.uploadedBy !== caller.id) {
      throw new NotFoundException('Không tìm thấy tệp');
    }
    return asset;
  }

  /**
   * Lấy mục đích sử dụng của tệp từ object key.
   *
   * @param asset Bản ghi media_assets
   * @returns Mục đích sử dụng của tệp
   * @throws BadRequestException Nếu object key không thuộc mục đích nào được hỗ trợ
   */
  private purposeOf(asset: MediaAssetEntity): MediaPurpose {
    const purpose = mediaPurposeOfObjectKey(asset.objectKey);
    if (!purpose) {
      throw new BadRequestException(
        'Tệp không thuộc mục đích tải lên nào được hỗ trợ',
      );
    }
    return purpose;
  }

  /**
   * Đọc metadata thật của tệp trên storage (HEAD object) và kiểm tra theo giới hạn của mục đích và số liệu đã khai báo.
   *
   * @param asset Bản ghi media_assets
   * @param purpose Mục đích sử dụng của tệp
   * @throws ConflictException Nếu tệp chưa có trên storage
   * @throws BadRequestException Nếu tệp thật sai định dạng, vượt dung lượng hoặc không khớp số liệu khai báo
   */
  private async verifyStoredObject(
    asset: MediaAssetEntity,
    purpose: MediaPurpose,
  ): Promise<void> {
    const stored = await this.storage
      .getMetadata(asset.objectKey)
      .catch((error: unknown) => {
        if (isObjectNotFoundError(error)) {
          throw new ConflictException('Tệp chưa được tải lên storage');
        }
        throw error;
      });
    if (stored.contentType === undefined || stored.byteSize === undefined) {
      throw new BadRequestException(
        'Storage không trả về định dạng hoặc dung lượng của tệp',
      );
    }
    const actualType = normalizeContentType(stored.contentType);
    assertMediaSpec(purpose, actualType, stored.byteSize);
    if (
      actualType !== asset.mimeType ||
      stored.byteSize !== Number(asset.byteSize)
    ) {
      throw new BadRequestException(
        'Tệp đã tải lên không khớp định dạng hoặc dung lượng đã khai báo',
      );
    }
  }
}

/**
 * Nhận biết lỗi "không có object" do S3/MinIO trả về khi HEAD một key chưa tồn tại.
 *
 * @param error Lỗi bắt được từ S3 client
 * @returns true nếu là lỗi 404 / NotFound / NoSuchKey
 */
function isObjectNotFoundError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) {
    return false;
  }
  const { name, $metadata } = error as {
    name?: string;
    $metadata?: { httpStatusCode?: number };
  };
  return (
    name === 'NotFound' ||
    name === 'NoSuchKey' ||
    $metadata?.httpStatusCode === 404
  );
}

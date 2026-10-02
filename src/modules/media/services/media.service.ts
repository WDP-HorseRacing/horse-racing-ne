import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
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
  toMediaDownloadUrlResponse,
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
    @InjectRepository(MediaAssetEntity)
    private readonly assets: Repository<MediaAssetEntity>,
    private readonly dataSource: DataSource,
    private readonly storage: ObjectStorageService,
  ) {}

  /**
   * Tạo yêu cầu tải tệp lên: kiểm tra số liệu khai báo, lưu bản ghi media_assets và cấp presigned PUT URL.
   *
   * - Vai trò được xin tải lên tùy mục đích, theo MEDIA_UPLOAD_PERMISSION (ảnh ngựa: chỉ CLUB_MANAGER).
   * - Mime type và dung lượng khai báo phải đạt giới hạn của mục đích (ảnh ngựa: JPEG/PNG/WebP, tối đa 10 MB).
   * - Presigned URL ký kèm Content-Type và Content-Length; storage từ chối nếu client gửi tệp khác khai báo.
   * - Tệp chỉ dùng được sau khi gọi complete, hoặc khi module khác xác minh lại qua assertAttachableHorsePhoto.
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param body Mục đích, tên tệp, mime type và dung lượng khai báo
   * @returns Promise trả về MediaUploadRequestResponseDto - assetId, presigned URL và header bắt buộc khi PUT
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
    const asset = await this.assets.save(
      this.assets.create({
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
   * - Chỉ người tạo yêu cầu tải lên được xác nhận; người khác nhận 404.
   * - Gọi lại nhiều lần vẫn an toàn, mỗi lần đều kiểm lại trên storage.
   * - Tệp sai giới hạn vẫn nằm trên storage, không bị xóa ở bước này.
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param assetId UUID của bản ghi media_assets
   * @returns Promise trả về MediaAssetResponseDto - Metadata của tệp đã xác nhận
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
    const asset = await this.findAsset(assetId);
    if (asset.uploadedBy !== caller.id) {
      throw new NotFoundException('Không tìm thấy tệp');
    }
    await this.verifyStoredObject(asset, this.purposeOf(asset));
    return toMediaAssetResponse(asset);
  }

  /**
   * Lấy metadata của tệp do chính người gọi tải lên.
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param assetId UUID của bản ghi media_assets
   * @returns Promise trả về MediaAssetResponseDto - Metadata của tệp
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
   * @returns Promise trả về MediaDownloadUrlResponseDto - URL tải tệp
   * @throws ForbiddenException Nếu tài khoản không tồn tại, không hoạt động hoặc chưa có vai trò
   * @throws NotFoundException Nếu không có tệp hoặc người gọi không được xem
   */
  async createDownloadUrl(
    actor: Actor,
    assetId: string,
  ): Promise<MediaDownloadUrlResponseDto> {
    const asset = await this.findViewableAsset(actor, assetId);
    const url = await this.storage.createDownloadUrl(asset.objectKey);
    return toMediaDownloadUrlResponse(url);
  }

  /**
   * Cấp presigned GET URL có hạn dùng cho một tệp, không kiểm quyền xem; nơi gọi phải tự kiểm quyền trước
   *
   * @param assetId UUID của bản ghi media_assets
   * @returns Promise trả về URL tải tệp
   * @throws NotFoundException Nếu không có tệp
   */
  async signDownloadUrl(assetId: string): Promise<string> {
    const asset = await this.findAsset(assetId);
    return this.storage.createDownloadUrl(asset.objectKey);
  }

  /**
   * Cấp presigned GET URL cho nhiều tệp cùng lúc, không kiểm quyền xem
   *
   * - Đọc DB một lần cho cả danh sách; tệp không tồn tại thì bỏ qua
   *
   * @param assetIds UUID các bản ghi media_assets
   * @returns Promise trả về map từ UUID tệp sang URL tải tệp
   */
  async signDownloadUrls(assetIds: string[]): Promise<Map<string, string>> {
    const urls = new Map<string, string>();
    if (assetIds.length === 0) return urls;
    const assets = await this.assets.findBy({ id: In(assetIds) });
    for (const asset of assets) {
      urls.set(asset.id, await this.storage.createDownloadUrl(asset.objectKey));
    }
    return urls;
  }

  /**
   * Kiểm tra một tệp có được gắn làm ảnh đại diện ngựa không; gọi trước khi mở transaction tạo hoặc đổi ảnh.
   *
   * - Tệp phải do chính người gọi tải lên.
   * - Tệp phải được xin tải lên với mục đích HORSE_PHOTO.
   * - Metadata thật trên storage phải đạt giới hạn ảnh ngựa và khớp số liệu khai báo.
   * - Có một lần gọi HEAD tới storage.
   *
   * @param callerId UUID của người gọi (users.id)
   * @param assetId UUID của bản ghi media_assets
   * @returns Promise trả về MediaAssetEntity - Tệp hợp lệ để gắn làm ảnh
   * @throws NotFoundException Nếu không có tệp hoặc tệp không do người gọi tải lên
   * @throws BadRequestException Nếu tệp không phải ảnh ngựa, sai định dạng, vượt dung lượng hoặc không khớp số liệu khai báo
   * @throws ConflictException Nếu tệp chưa có trên storage
   */
  async assertAttachableHorsePhoto(
    callerId: string,
    assetId: string,
  ): Promise<MediaAssetEntity> {
    const asset = await this.findAsset(assetId);
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
   * @param assetId UUID của bản ghi media_assets
   * @returns Promise trả về bản ghi media_assets
   * @throws NotFoundException Nếu không có tệp
   */
  private async findAsset(assetId: string): Promise<MediaAssetEntity> {
    const asset = await this.assets.findOneBy({ id: assetId });
    if (!asset) {
      throw new NotFoundException('Không tìm thấy tệp');
    }
    return asset;
  }

  /**
   * Lấy tệp do chính người gọi tải lên.
   *
   * - Người khác nhận 404.
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param assetId UUID của bản ghi media_assets
   * @returns Promise trả về MediaAssetEntity - Tệp người gọi được xem
   * @throws ForbiddenException Nếu tài khoản không tồn tại, không hoạt động hoặc chưa có vai trò
   * @throws NotFoundException Nếu không có tệp hoặc người gọi không được xem
   */
  private async findViewableAsset(
    actor: Actor,
    assetId: string,
  ): Promise<MediaAssetEntity> {
    const caller = await currentUserForActor(this.dataSource.manager, actor);
    const asset = await this.findAsset(assetId);
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

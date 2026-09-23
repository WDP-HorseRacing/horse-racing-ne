import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { UserRole } from '../../../common/enums/role.enum';
import { UserStatus } from '../../../common/enums/user-status.enum';
import { ObjectStorageService } from '../../../common/infrastructure/storage/object-storage.service';
import type { Actor } from '../../../common/types/actor';
import { UserEntity } from '../../users/entities/user.entity';
import { HORSE_PHOTO_MAX_BYTES } from '../constants/media.constants';
import { MediaAssetEntity } from '../entities/media-asset.entity';
import { MediaPurpose } from '../enums/media-purpose.enum';
import { MediaService } from './media.service';

const CALLER_ID = 'user-1';
const ASSET_ID = '11111111-1111-4111-8111-111111111111';
const PHOTO_KEY = `horse-photos/${ASSET_ID}.jpg`;

function makeActor(roles: UserRole[] = [UserRole.CLUB_MANAGER]): Actor {
  return { sub: 'kc-1', roles };
}

function makeAsset(
  overrides: Partial<MediaAssetEntity> = {},
): MediaAssetEntity {
  return Object.assign(new MediaAssetEntity(), {
    id: ASSET_ID,
    uploadedBy: CALLER_ID,
    objectKey: PHOTO_KEY,
    mimeType: 'image/jpeg',
    byteSize: '2048',
    createdAt: new Date('2026-09-01T00:00:00Z'),
    ...overrides,
  });
}

interface Setup {
  asset?: MediaAssetEntity | null;
  callerRole?: UserRole;
}

function setup({
  asset = makeAsset(),
  callerRole = UserRole.CLUB_MANAGER,
}: Setup = {}) {
  const user = {
    id: CALLER_ID,
    status: UserStatus.ACTIVE,
    role: callerRole,
  } as UserEntity;
  const manager = {
    findOne: jest.fn((entity: unknown): Promise<unknown> =>
      Promise.resolve(entity === UserEntity ? user : null),
    ),
    findOneBy: jest.fn(() => Promise.resolve(asset)),
    create: jest.fn((_entity: unknown, data: object) =>
      Object.assign(new MediaAssetEntity(), data),
    ),
    save: jest.fn((entity: MediaAssetEntity) =>
      Promise.resolve(Object.assign(entity, { createdAt: new Date() })),
    ),
  };
  const storage = {
    createUploadUrl: jest.fn(() => Promise.resolve('https://s3/put')),
    createDownloadUrl: jest.fn(() => Promise.resolve('https://s3/get')),
    getMetadata: jest.fn(() =>
      Promise.resolve({ contentType: 'image/jpeg', byteSize: 2048 }),
    ),
  };
  const dataSource = { manager } as unknown as DataSource;
  const service = new MediaService(
    dataSource,
    storage as unknown as ObjectStorageService,
  );
  return { service, manager, storage };
}

describe('MediaService.requestUpload', () => {
  const body = {
    purpose: MediaPurpose.HORSE_PHOTO,
    fileName: 'gio-bac.JPG',
    mimeType: 'Image/JPEG',
    byteSize: 2048,
  };

  it('saves the asset under the horse-photos prefix and returns a presigned PUT URL', async () => {
    const { service, manager, storage } = setup();

    const result = await service.requestUpload(makeActor(), body);

    expect(result.uploadUrl).toBe('https://s3/put');
    expect(result.method).toBe('PUT');
    expect(result.headers).toEqual({
      'Content-Type': 'image/jpeg',
      'Content-Length': '2048',
    });
    const saved = manager.save.mock.calls[0][0];
    expect(saved).toMatchObject({
      id: result.assetId,
      uploadedBy: CALLER_ID,
      objectKey: `horse-photos/${result.assetId}.jpg`,
      mimeType: 'image/jpeg',
      byteSize: '2048',
    });
    expect(storage.createUploadUrl).toHaveBeenCalledWith(
      `horse-photos/${result.assetId}.jpg`,
      'image/jpeg',
      2048,
    );
  });

  it.each(['image/png', 'image/webp'])('accepts %s', async (mimeType) => {
    const { service } = setup();
    await expect(
      service.requestUpload(makeActor(), { ...body, mimeType }),
    ).resolves.toBeDefined();
  });

  it('accepts exactly 10 MB', async () => {
    const { service } = setup();
    await expect(
      service.requestUpload(makeActor(), {
        ...body,
        byteSize: HORSE_PHOTO_MAX_BYTES,
      }),
    ).resolves.toBeDefined();
  });

  it('rejects a declared size over 10 MB without signing or saving', async () => {
    const { service, manager, storage } = setup();

    await expect(
      service.requestUpload(makeActor(), {
        ...body,
        byteSize: HORSE_PHOTO_MAX_BYTES + 1,
      }),
    ).rejects.toThrow(BadRequestException);
    expect(storage.createUploadUrl).not.toHaveBeenCalled();
    expect(manager.save).not.toHaveBeenCalled();
  });

  it.each(['image/gif', 'application/pdf', 'image/svg+xml'])(
    'rejects declared mime type %s',
    async (mimeType) => {
      const { service, manager } = setup();
      await expect(
        service.requestUpload(makeActor(), { ...body, mimeType }),
      ).rejects.toThrow(BadRequestException);
      expect(manager.save).not.toHaveBeenCalled();
    },
  );

  it('rejects an inactive account', async () => {
    const { service, manager } = setup();
    manager.findOne.mockResolvedValueOnce({
      id: CALLER_ID,
      status: UserStatus.LOCKED,
      role: UserRole.GROOM,
    });
    await expect(service.requestUpload(makeActor(), body)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it.each([
    UserRole.HEAD_TRAINER,
    UserRole.VETERINARIAN,
    UserRole.GROOM,
    UserRole.HORSE_OWNER,
  ])(
    'rejects a horse photo upload by %s (403) without signing or saving',
    async (role) => {
      const { service, manager, storage } = setup({ callerRole: role });

      const error: unknown = await service
        .requestUpload(makeActor([role]), body)
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(ForbiddenException);
      expect((error as ForbiddenException).message).toBe(
        'Chỉ Quản lý câu lạc bộ được tải lên ảnh đại diện ngựa',
      );
      expect(storage.createUploadUrl).not.toHaveBeenCalled();
      expect(manager.save).not.toHaveBeenCalled();
    },
  );

  it('lets a CLUB_MANAGER request a horse photo upload', async () => {
    const { service, storage } = setup({ callerRole: UserRole.CLUB_MANAGER });

    const result = await service.requestUpload(
      makeActor([UserRole.CLUB_MANAGER]),
      body,
    );

    expect(result.uploadUrl).toBe('https://s3/put');
    expect(storage.createUploadUrl).toHaveBeenCalledTimes(1);
  });
});

describe('MediaService.complete', () => {
  it('returns metadata when the stored object matches the declaration', async () => {
    const { service, storage } = setup();

    const result = await service.complete(makeActor(), ASSET_ID);

    expect(storage.getMetadata).toHaveBeenCalledWith(PHOTO_KEY);
    expect(result).toEqual({
      id: ASSET_ID,
      uploadedBy: CALLER_ID,
      mimeType: 'image/jpeg',
      byteSize: 2048,
      createdAt: new Date('2026-09-01T00:00:00Z'),
    });
  });

  it('returns 404 when the asset does not exist', async () => {
    const { service } = setup({ asset: null });
    await expect(service.complete(makeActor(), ASSET_ID)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('returns 404 when the caller is not the uploader', async () => {
    const { service, storage } = setup({
      asset: makeAsset({ uploadedBy: 'someone-else' }),
    });
    await expect(service.complete(makeActor(), ASSET_ID)).rejects.toThrow(
      NotFoundException,
    );
    expect(storage.getMetadata).not.toHaveBeenCalled();
  });

  it('returns 409 when the object has not been uploaded yet', async () => {
    const { service, storage } = setup();
    storage.getMetadata.mockRejectedValueOnce(
      Object.assign(new Error('NotFound'), {
        name: 'NotFound',
        $metadata: { httpStatusCode: 404 },
      }),
    );
    await expect(service.complete(makeActor(), ASSET_ID)).rejects.toThrow(
      ConflictException,
    );
  });

  it('rethrows unexpected storage errors', async () => {
    const { service, storage } = setup();
    const failure = new Error('connection refused');
    storage.getMetadata.mockRejectedValueOnce(failure);
    await expect(service.complete(makeActor(), ASSET_ID)).rejects.toBe(failure);
  });

  it('rejects when the stored object is larger than 10 MB', async () => {
    const { service, storage } = setup({
      asset: makeAsset({ byteSize: String(HORSE_PHOTO_MAX_BYTES + 1) }),
    });
    storage.getMetadata.mockResolvedValueOnce({
      contentType: 'image/jpeg',
      byteSize: HORSE_PHOTO_MAX_BYTES + 1,
    });
    await expect(service.complete(makeActor(), ASSET_ID)).rejects.toThrow(
      'Ảnh đại diện không được vượt quá 10 MB',
    );
  });

  it('rejects when the stored content type is not an allowed image', async () => {
    const { service, storage } = setup();
    storage.getMetadata.mockResolvedValueOnce({
      contentType: 'text/html',
      byteSize: 2048,
    });
    await expect(service.complete(makeActor(), ASSET_ID)).rejects.toThrow(
      'Ảnh đại diện phải có định dạng JPEG, PNG hoặc WebP',
    );
  });

  it('rejects when the stored object differs from the declaration', async () => {
    const { service, storage } = setup();
    storage.getMetadata.mockResolvedValueOnce({
      contentType: 'image/png',
      byteSize: 2048,
    });
    await expect(service.complete(makeActor(), ASSET_ID)).rejects.toThrow(
      'Tệp đã tải lên không khớp định dạng hoặc dung lượng đã khai báo',
    );
  });

  it('rejects when storage returns no size', async () => {
    const { service, storage } = setup();
    storage.getMetadata.mockResolvedValueOnce({
      contentType: 'image/jpeg',
    } as never);
    await expect(service.complete(makeActor(), ASSET_ID)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('rejects an asset whose key belongs to no supported purpose', async () => {
    const { service, storage } = setup({
      asset: makeAsset({ objectKey: 'legacy/file.jpg' }),
    });
    await expect(service.complete(makeActor(), ASSET_ID)).rejects.toThrow(
      BadRequestException,
    );
    expect(storage.getMetadata).not.toHaveBeenCalled();
  });
});

describe('MediaService view access (getMetadata / createDownloadUrl)', () => {
  it('lets the uploader read metadata', async () => {
    const { service } = setup();
    await expect(service.getMetadata(makeActor(), ASSET_ID)).resolves.toEqual(
      expect.objectContaining({ id: ASSET_ID, byteSize: 2048 }),
    );
  });

  it('lets the uploader get a download URL', async () => {
    const { service, storage } = setup();
    await expect(
      service.createDownloadUrl(makeActor(), ASSET_ID),
    ).resolves.toEqual({ url: 'https://s3/get' });
    expect(storage.createDownloadUrl).toHaveBeenCalledWith(PHOTO_KEY);
  });

  it.each([UserRole.GROOM, UserRole.HORSE_OWNER, UserRole.CLUB_MANAGER])(
    'hides an asset uploaded by someone else from a %s (404) without signing',
    async (role) => {
      const { service, storage } = setup({
        asset: makeAsset({ uploadedBy: 'manager-2' }),
        callerRole: role,
      });
      await expect(
        service.createDownloadUrl(makeActor([role]), ASSET_ID),
      ).rejects.toThrow(NotFoundException);
      await expect(
        service.getMetadata(makeActor([role]), ASSET_ID),
      ).rejects.toThrow(NotFoundException);
      expect(storage.createDownloadUrl).not.toHaveBeenCalled();
    },
  );

  it('returns 404 when the asset does not exist', async () => {
    const { service } = setup({ asset: null });
    await expect(
      service.createDownloadUrl(makeActor(), ASSET_ID),
    ).rejects.toThrow(NotFoundException);
  });
});

describe('MediaService.signDownloadUrl', () => {
  it('signs a URL for any existing asset without checking the uploader', async () => {
    const { service, storage } = setup({
      asset: makeAsset({ uploadedBy: 'manager-2' }),
    });
    await expect(service.signDownloadUrl(ASSET_ID)).resolves.toBe(
      'https://s3/get',
    );
    expect(storage.createDownloadUrl).toHaveBeenCalledWith(PHOTO_KEY);
  });

  it('returns 404 when the asset does not exist', async () => {
    const { service, storage } = setup({ asset: null });
    await expect(service.signDownloadUrl(ASSET_ID)).rejects.toThrow(
      NotFoundException,
    );
    expect(storage.createDownloadUrl).not.toHaveBeenCalled();
  });
});

describe('MediaService.assertAttachableHorsePhoto', () => {
  it('returns the asset when it is a valid horse photo of the caller', async () => {
    const asset = makeAsset();
    const { service, storage } = setup({ asset });

    await expect(
      service.assertAttachableHorsePhoto(CALLER_ID, ASSET_ID),
    ).resolves.toBe(asset);
    expect(storage.getMetadata).toHaveBeenCalledWith(PHOTO_KEY);
  });

  it('returns 404 for an asset uploaded by someone else', async () => {
    const { service } = setup({ asset: makeAsset({ uploadedBy: 'other' }) });
    await expect(
      service.assertAttachableHorsePhoto(CALLER_ID, ASSET_ID),
    ).rejects.toThrow(NotFoundException);
  });

  it('returns 404 for a missing asset', async () => {
    const { service } = setup({ asset: null });
    await expect(
      service.assertAttachableHorsePhoto(CALLER_ID, ASSET_ID),
    ).rejects.toThrow(NotFoundException);
  });

  it('rejects an asset not requested as a horse photo', async () => {
    const { service, storage } = setup({
      asset: makeAsset({ objectKey: 'time-trial-videos/x.mp4' }),
    });
    await expect(
      service.assertAttachableHorsePhoto(CALLER_ID, ASSET_ID),
    ).rejects.toThrow('Tệp không phải ảnh đại diện ngựa');
    expect(storage.getMetadata).not.toHaveBeenCalled();
  });

  it('returns 409 when the photo was never uploaded to storage', async () => {
    const { service, storage } = setup();
    storage.getMetadata.mockRejectedValueOnce(
      Object.assign(new Error('NoSuchKey'), { name: 'NoSuchKey' }),
    );
    await expect(
      service.assertAttachableHorsePhoto(CALLER_ID, ASSET_ID),
    ).rejects.toThrow(ConflictException);
  });
});

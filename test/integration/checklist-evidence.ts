import { randomUUID } from 'node:crypto';
import { NotFoundException } from '@nestjs/common';
import { In } from 'typeorm';
import type { DataSource } from 'typeorm';
import { MediaAssetEntity } from '../../src/modules/media/entities/media-asset.entity';
import { MediaService } from '../../src/modules/media/services/media.service';

/**
 * Creates a completed checklist-evidence asset for integration tests.
 *
 * @param dataSource Integration-test database connection
 * @param uploaderId User who uploaded the evidence
 * @returns UUID of the persisted media asset
 */
export async function createChecklistEvidence(
  dataSource: DataSource,
  uploaderId: string,
): Promise<string> {
  const id = randomUUID();
  await dataSource.getRepository(MediaAssetEntity).save(
    Object.assign(new MediaAssetEntity(), {
      id,
      uploadedBy: uploaderId,
      objectKey: `checklist-evidence/${id}.jpg`,
      mimeType: 'image/jpeg',
      byteSize: '1024',
    }),
  );
  return id;
}

/**
 * Media-service test double backed by the integration-test database.
 *
 * @param dataSource Integration-test database connection
 * @returns MediaService contract for checklist evidence validation and URLs
 */
export function checklistEvidenceMedia(dataSource: DataSource): MediaService {
  const findAttachable = async (
    callerId: string,
    assetId: string,
    prefix: string,
  ) => {
    const asset = await dataSource
      .getRepository(MediaAssetEntity)
      .findOneBy({ id: assetId });
    if (
      !asset ||
      asset.uploadedBy !== callerId ||
      !asset.objectKey.startsWith(prefix)
    ) {
      throw new NotFoundException('Không tìm thấy tệp');
    }
    return asset;
  };
  return {
    assertAttachableHorsePhoto: (callerId: string, assetId: string) =>
      findAttachable(callerId, assetId, 'horse-photos/'),
    assertAttachableTrialVideo: (callerId: string, assetId: string) =>
      findAttachable(callerId, assetId, 'trial-videos/'),
    assertAttachableIncidentPhoto: (callerId: string, assetId: string) =>
      findAttachable(callerId, assetId, 'incident-photos/'),
    assertAttachableChecklistEvidence: (callerId: string, assetId: string) =>
      findAttachable(callerId, assetId, 'checklist-evidence/'),
    signDownloadUrls: async (assetIds: string[]) => {
      const assets = await dataSource
        .getRepository(MediaAssetEntity)
        .findBy({ id: In(assetIds) });
      return new Map(
        assets.map((asset) => [asset.id, `https://test-storage/${asset.id}`]),
      );
    },
  } as unknown as MediaService;
}

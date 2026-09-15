import {
  DeleteObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  GetObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { S3_CLIENT } from './object-storage.token';

export interface StoredObjectMetadata {
  byteSize?: number;
  contentType?: string;
  etag?: string;
  lastModified?: Date;
}

@Injectable()
export class ObjectStorageService implements OnModuleDestroy {
  private readonly bucket: string;
  private readonly presignedUrlTtlSeconds: number;

  constructor(
    @Inject(S3_CLIENT) private readonly client: S3Client,
    config: ConfigService,
  ) {
    this.bucket = config.getOrThrow<string>('S3_BUCKET');
    this.presignedUrlTtlSeconds = config.getOrThrow<number>(
      'S3_PRESIGNED_URL_TTL_SECONDS',
    );
  }

  async createUploadUrl(
    objectKey: string,
    contentType: string,
    byteSize: number,
  ): Promise<string> {
    this.assertObjectKey(objectKey);
    return getSignedUrl(
      this.client,
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: objectKey,
        ContentType: contentType,
        ContentLength: byteSize,
      }),
      { expiresIn: this.presignedUrlTtlSeconds },
    );
  }

  async createDownloadUrl(objectKey: string): Promise<string> {
    this.assertObjectKey(objectKey);
    return getSignedUrl(
      this.client,
      new GetObjectCommand({ Bucket: this.bucket, Key: objectKey }),
      { expiresIn: this.presignedUrlTtlSeconds },
    );
  }

  async getMetadata(objectKey: string): Promise<StoredObjectMetadata> {
    this.assertObjectKey(objectKey);
    const result = await this.client.send(
      new HeadObjectCommand({ Bucket: this.bucket, Key: objectKey }),
    );
    return {
      byteSize: result.ContentLength,
      contentType: result.ContentType,
      etag: result.ETag,
      lastModified: result.LastModified,
    };
  }

  async delete(objectKey: string): Promise<void> {
    this.assertObjectKey(objectKey);
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: objectKey }),
    );
  }

  onModuleDestroy(): void {
    this.client.destroy();
  }

  private assertObjectKey(objectKey: string): void {
    if (
      !objectKey ||
      objectKey.startsWith('/') ||
      objectKey.split('/').some((segment) => segment === '..')
    ) {
      throw new TypeError('Object key must be a safe bucket-relative path');
    }
  }
}

import { S3Client } from '@aws-sdk/client-s3';
import { ConfigService } from '@nestjs/config';
import { ObjectStorageModule } from './object-storage.module';
import { ObjectStorageService } from './object-storage.service';
import { S3_CLIENT } from './object-storage.token';

const settings: Record<string, unknown> = {
  S3_ENDPOINT: 'http://127.0.0.1:9000',
  S3_REGION: 'us-east-1',
  S3_FORCE_PATH_STYLE: true,
  S3_ACCESS_KEY: 'access',
  S3_SECRET_KEY: 'secret',
  S3_BUCKET: 'bucket',
  S3_PRESIGNED_URL_TTL_SECONDS: 60,
};

describe('ObjectStorageService.createUploadUrl', () => {
  let client: S3Client;
  let service: ObjectStorageService;

  beforeEach(() => {
    const config = {
      getOrThrow: (key: string) => settings[key],
    } as unknown as ConfigService;
    const provider = Reflect.getMetadata('providers', ObjectStorageModule) as {
      provide: unknown;
      useFactory?: (c: ConfigService) => S3Client;
    }[];
    const factory = provider.find((p) => p.provide === S3_CLIENT)!.useFactory!;
    client = factory(config);
    service = new ObjectStorageService(client, config);
  });

  afterEach(() => client.destroy());

  it('không đính checksum của body rỗng vào URL', async () => {
    const url = new URL(
      await service.createUploadUrl('horses/a.png', 'image/png', 5),
    );

    expect(url.searchParams.get('x-amz-checksum-crc32')).toBeNull();
    expect(url.searchParams.get('x-amz-sdk-checksum-algorithm')).toBeNull();
  });

  it('ký cả content-type và content-length', async () => {
    const url = new URL(
      await service.createUploadUrl('horses/a.png', 'image/png', 5),
    );

    expect(url.searchParams.get('X-Amz-SignedHeaders')).toBe(
      'content-length;content-type;host',
    );
  });
});

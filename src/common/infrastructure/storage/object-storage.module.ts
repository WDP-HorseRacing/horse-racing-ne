import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { S3Client } from '@aws-sdk/client-s3';
import { ObjectStorageService } from './object-storage.service';
import { S3_CLIENT } from './object-storage.token';

@Global()
@Module({
  providers: [
    {
      provide: S3_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        new S3Client({
          endpoint: config.getOrThrow<string>('S3_ENDPOINT'),
          region: config.getOrThrow<string>('S3_REGION'),
          forcePathStyle: config.getOrThrow<boolean>('S3_FORCE_PATH_STYLE'),
          credentials: {
            accessKeyId: config.getOrThrow<string>('S3_ACCESS_KEY'),
            secretAccessKey: config.getOrThrow<string>('S3_SECRET_KEY'),
          },
        }),
    },
    ObjectStorageService,
  ],
  exports: [ObjectStorageService],
})
export class ObjectStorageModule {}

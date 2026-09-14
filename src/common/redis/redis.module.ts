import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { RedisService } from './redis.service';
import { REDIS_CLIENT } from './redis.token';

@Global()
@Module({
  providers: [
    {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      provide: REDIS_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        new Redis({
          host: config.getOrThrow<string>('REDIS_HOST'),
          port: config.getOrThrow<number>('REDIS_PORT'),
          username: config.get<string>('REDIS_USERNAME'),
          password: config.get<string>('REDIS_PASSWORD'),
          lazyConnect: true,
          maxRetriesPerRequest: 1,
        }),
    },
    RedisService,
  ],
  exports: [RedisService],
})
export class RedisModule {}

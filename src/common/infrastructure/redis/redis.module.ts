import { BullModule } from '@nestjs/bullmq';
import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import {
  bullConnectionOptions,
  redisConnectionOptions,
} from './redis-connection';
import { RedisService } from './redis.service';
import { REDIS_CLIENT } from './redis.token';

@Global()
@Module({
  imports: [
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: bullConnectionOptions(config),
      }),
    }),
  ],
  providers: [
    {
      provide: REDIS_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        new Redis({
          ...redisConnectionOptions(config),
          lazyConnect: true,
          maxRetriesPerRequest: 1,
        }),
    },
    RedisService,
  ],
  exports: [RedisService],
})
export class RedisModule {}

import { Injectable, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleDestroy {
  private client?: Redis;

  getClient(): Redis {
    const url = process.env.REDIS_URL;
    if (!url) throw new Error('REDIS_URL is not configured');
    this.client ??= new Redis(url, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
    });
    return this.client;
  }

  onModuleDestroy(): void {
    if (this.client) this.client.disconnect();
  }
}

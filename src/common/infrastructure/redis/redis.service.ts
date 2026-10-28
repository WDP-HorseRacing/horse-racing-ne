import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';
import { REDIS_CLIENT } from './redis.token';

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);

  constructor(@Inject(REDIS_CLIENT) private readonly client: Redis) {}

  getClient(): Redis {
    return this.client;
  }

  /** Luu chuoi kem TTL tuy chon (giay).*/
  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (ttlSeconds && ttlSeconds > 0) {
      await this.client.set(key, value, 'EX', ttlSeconds);
    } else {
      await this.client.set(key, value);
    }
  }

  get(key: string): Promise<string | null> {
    return this.client.get(key);
  }

  /** Luu object duoi dang JSON kem TTL tuy chon (giay). */
  setJson<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    return this.set(key, JSON.stringify(value), ttlSeconds);
  }

  /** Doc va parse JSON; tra null neu khong co hoac hong. */
  async getJson<T>(key: string): Promise<T | null> {
    const raw = await this.get(key);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      this.logger.warn(`Bo qua JSON hong tai redis key ${key}`);
      return null;
    }
  }

  async del(...keys: string[]): Promise<number> {
    if (!keys.length) return 0;
    return this.client.del(...keys);
  }

  onModuleDestroy(): void {
    this.client.disconnect();
  }
}

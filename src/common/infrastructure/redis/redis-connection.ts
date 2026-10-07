import type { ConfigService } from '@nestjs/config';

/**
 * Thông tin kết nối Redis đọc từ env, dùng chung cho Redis client và BullMQ.
 */
export interface RedisConnectionOptions {
  host: string;
  port: number;
  username?: string;
  password?: string;
}

/**
 * Đọc thông tin kết nối Redis từ env
 *
 * @param config ConfigService của ứng dụng
 * @returns Host, port, username, password của Redis
 */
export function redisConnectionOptions(
  config: ConfigService,
): RedisConnectionOptions {
  return {
    host: config.getOrThrow<string>('REDIS_HOST'),
    port: config.getOrThrow<number>('REDIS_PORT'),
    username: config.get<string>('REDIS_USERNAME'),
    password: config.get<string>('REDIS_PASSWORD'),
  };
}

/**
 * Đọc thông tin kết nối Redis cho BullMQ
 *
 * - Mất kết nối Redis: lệnh (vd thêm job) báo lỗi sau một lần thử kết nối lại, không đứng chờ Redis lên lại
 *
 * @param config ConfigService của ứng dụng
 * @returns Thông tin kết nối Redis kèm giới hạn một lần thử lại cho mỗi lệnh
 */
export function bullConnectionOptions(
  config: ConfigService,
): RedisConnectionOptions & { maxRetriesPerRequest: number } {
  return { ...redisConnectionOptions(config), maxRetriesPerRequest: 1 };
}

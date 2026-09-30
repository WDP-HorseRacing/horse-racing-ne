import 'reflect-metadata';
import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import { join } from 'node:path';
import { DataSource } from 'typeorm';

/**
 * Postgres dùng riêng cho một file integration test: container Docker mới, đã chạy đủ migration
 */
export interface TestDatabase {
  dataSource: DataSource;
  container: StartedPostgreSqlContainer;
}

const SRC = join(__dirname, '../../src');

/**
 * Bật một container Postgres 16 trống ở port ngẫu nhiên và chạy toàn bộ migration của repo
 *
 * - Không đụng DB dev hay port 5432; mỗi file test có DB riêng
 * - Gọi trong beforeAll, nhớ gọi stopTestDatabase trong afterAll
 *
 * @returns A promise resolving to DataSource đã kết nối và container đang chạy
 */
export async function startTestDatabase(): Promise<TestDatabase> {
  const container = await new PostgreSqlContainer('postgres:16-alpine').start();
  const dataSource = new DataSource({
    type: 'postgres',
    url: container.getConnectionUri(),
    entities: [join(SRC, 'modules/**/*.entity.ts')],
    migrations: [join(SRC, 'migrations/*.ts')],
    synchronize: false,
  });
  await dataSource.initialize();
  await dataSource.runMigrations();
  return { dataSource, container };
}

/**
 * Đóng kết nối và xóa container của startTestDatabase
 *
 * @param db DB đã bật bằng startTestDatabase, bỏ qua nếu chưa bật được
 * @returns A promise resolving khi đã dọn xong
 */
export async function stopTestDatabase(db?: TestDatabase): Promise<void> {
  if (!db) return;
  await db.dataSource.destroy();
  await db.container.stop();
}

/**
 * Xóa sạch dữ liệu mọi bảng (trừ bảng migrations) để các test không dính dữ liệu của nhau
 *
 * @param dataSource DataSource của DB test
 * @returns A promise resolving khi đã xóa xong
 */
export async function truncateAll(dataSource: DataSource): Promise<void> {
  const rows: Array<{ tablename: string }> = await dataSource.query(
    `SELECT tablename FROM pg_tables
      WHERE schemaname = 'public' AND tablename <> 'migrations'`,
  );
  if (rows.length === 0) return;
  const tables = rows.map(({ tablename }) => `"${tablename}"`).join(', ');
  await dataSource.query(`TRUNCATE ${tables} RESTART IDENTITY CASCADE`);
}

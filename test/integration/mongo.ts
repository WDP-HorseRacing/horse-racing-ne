import {
  MongoDBContainer,
  type StartedMongoDBContainer,
} from '@testcontainers/mongodb';
import mongoose, { type Connection } from 'mongoose';
import * as os from 'node:os';

/**
 * MongoDB dùng riêng cho một file integration test: container Docker mới, replica set một node
 */
export interface TestMongo {
  connection: Connection;
  container: StartedMongoDBContainer;
}

/**
 * Bật một container MongoDB 8 trống ở port ngẫu nhiên và mở kết nối Mongoose tới database `test`
 *
 * - Không đụng Mongo dev hay port 27017; mỗi file test có DB riêng
 * - Truyền sẵn module `os` cho driver vì Jest không chạy được `import('os')` động mà driver dùng để dựng handshake
 * - Gọi trong beforeAll, nhớ gọi stopTestMongo trong afterAll
 *
 * @returns Promise trả về kết nối Mongoose và container đang chạy
 */
export async function startTestMongo(): Promise<TestMongo> {
  const container = await new MongoDBContainer('mongo:8.0').start();
  const connection = await mongoose
    .createConnection(container.getConnectionString(), {
      dbName: 'test',
      directConnection: true,
      runtimeAdapters: { os },
    })
    .asPromise();
  return { connection, container };
}

/**
 * Đóng kết nối và xóa container của startTestMongo
 *
 * @param mongo Mongo đã bật bằng startTestMongo, bỏ qua nếu chưa bật được
 * @returns Promise hoàn tất khi đã dọn xong
 */
export async function stopTestMongo(mongo?: TestMongo): Promise<void> {
  if (!mongo) return;
  await mongo.connection.close();
  await mongo.container.stop();
}

/**
 * Xóa sạch document của mọi collection nhưng giữ collection và index
 *
 * @param connection Kết nối Mongoose của DB test
 * @returns Promise hoàn tất khi đã xóa xong
 */
export async function clearAllCollections(
  connection: Connection,
): Promise<void> {
  const collections = await connection.db!.listCollections().toArray();
  await Promise.all(
    collections
      .filter(({ name }) => !name.startsWith('system.'))
      .map(({ name }) => connection.collection(name).deleteMany({})),
  );
}

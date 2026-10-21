import type { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import type { Model } from 'mongoose';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:net';
import { GenericContainer, type StartedTestContainer } from 'testcontainers';
import { bullConnectionOptions } from '../../src/common/infrastructure/redis/redis-connection';
import { NotificationDeliveryService } from '../../src/modules/notifications/delivery/notification-delivery.service';
import { PushChannel } from '../../src/modules/notifications/delivery/push.channel';
import { RealtimeChannel } from '../../src/modules/notifications/delivery/realtime.channel';
import { NotificationCategory } from '../../src/modules/notifications/enums/notification-category.enum';
import { NotificationPriority } from '../../src/modules/notifications/enums/notification-priority.enum';
import {
  NotificationRecord,
  NotificationSchema,
} from '../../src/modules/notifications/schemas/notification.schema';
import type { NotificationPushJob } from '../../src/modules/notifications/types/notification.types';
import type { RealtimeGateway } from '../../src/modules/realtime/realtime.gateway';
import { startContainerWithRetry } from './container';
import { startTestMongo, stopTestMongo, type TestMongo } from './mongo';

const freePort = () =>
  new Promise<number>((resolve) => {
    const server = createServer().listen(0, () => {
      const { port } = server.address() as { port: number };
      server.close(() => resolve(port));
    });
  });

const startRedis = (port: number) =>
  startContainerWithRetry(() =>
    new GenericContainer('redis:7-alpine')
      .withExposedPorts({ container: 6379, host: port })
      .start(),
  );

describe('NotificationDeliveryService push catch-up when Redis goes down', () => {
  let mongo: TestMongo;
  let model: Model<NotificationRecord>;
  let port: number;
  let redis: StartedTestContainer | undefined;
  let queue: Queue<NotificationPushJob>;
  let emitToUser: jest.Mock;
  let service: NotificationDeliveryService;

  beforeAll(async () => {
    mongo = await startTestMongo();
    model = mongo.connection.model(NotificationRecord.name, NotificationSchema);
    await model.init();
    port = await freePort();
    redis = await startRedis(port);
    const env: Record<string, string | number> = {
      REDIS_HOST: 'localhost',
      REDIS_PORT: port,
    };
    const config = {
      getOrThrow: (key: string) => env[key],
      get: (key: string) => env[key],
    } as unknown as ConfigService;
    queue = new Queue('notification-push-catchup-test', {
      connection: bullConnectionOptions(config),
    });
    emitToUser = jest.fn();
    service = new NotificationDeliveryService(
      model,
      [new RealtimeChannel({ emitToUser } as unknown as RealtimeGateway)],
      new PushChannel(queue),
    );
  });

  afterAll(async () => {
    await queue?.close();
    await redis?.stop();
    await stopTestMongo(mongo);
  });

  const draft = (eventId: string, recipientIds: string[]) => ({
    eventId,
    recipientIds,
    category: NotificationCategory.MEASUREMENT_ALERT,
    priority: NotificationPriority.URGENT,
    title: 'KHẨN',
    message: 'Ngựa sốt',
    resource: null,
  });

  it('rejects while Redis is down, then queues the push on redelivery without a second socket emit', async () => {
    const vet = randomUUID();
    const trainer = randomUUID();
    const event = draft(randomUUID(), [vet, trainer]);
    await redis!.stop();
    redis = undefined;

    await expect(service.send(event)).rejects.toThrow();
    const stored = await model.find({ eventId: event.eventId }).lean();
    expect(stored).toHaveLength(2);
    expect(stored.map((n) => n.pushQueuedAt)).toEqual([null, null]);
    expect(emitToUser).toHaveBeenCalledTimes(2);

    redis = await startRedis(port);
    let sent: string[] | undefined;
    for (let attempt = 0; attempt < 20 && !sent; attempt++) {
      sent = await service.send(event).catch(() => undefined);
      if (!sent) await new Promise((resolve) => setTimeout(resolve, 500));
    }

    expect(sent).toEqual([]);
    for (const notification of stored) {
      expect(await queue.getJob(notification._id)).toBeDefined();
    }
    const after = await model.find({ eventId: event.eventId }).lean();
    expect(after.every((n) => n.pushQueuedAt instanceof Date)).toBe(true);
    expect(emitToUser).toHaveBeenCalledTimes(2);
  }, 90_000);
});

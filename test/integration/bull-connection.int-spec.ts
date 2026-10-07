import { Queue } from 'bullmq';
import type { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:net';
import { GenericContainer, type StartedTestContainer } from 'testcontainers';
import { bullConnectionOptions } from '../../src/common/infrastructure/redis/redis-connection';
import { PushChannel } from '../../src/modules/notifications/delivery/push.channel';
import type { NotificationRecord } from '../../src/modules/notifications/schemas/notification.schema';
import type { NotificationPushJob } from '../../src/modules/notifications/types/notification.types';
import { startContainerWithRetry } from './container';

const QUEUE = 'bull-connection-test';

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

const notification = () => ({ _id: randomUUID() }) as NotificationRecord;

describe('BullMQ connection when Redis goes down', () => {
  let port: number;
  let redis: StartedTestContainer | undefined;
  let queue: Queue<NotificationPushJob>;
  let channel: PushChannel;

  beforeAll(async () => {
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
    queue = new Queue(QUEUE, { connection: bullConnectionOptions(config) });
    channel = new PushChannel(queue);
  });

  afterAll(async () => {
    await queue?.close();
    await redis?.stop();
  });

  it('gives up while Redis stays down and queues again once Redis is back', async () => {
    await channel.deliver([notification()]);
    await redis!.stop();
    redis = undefined;

    const startedAt = Date.now();
    await expect(channel.deliver([notification()])).rejects.toThrow(
      'max retries per request',
    );
    expect(Date.now() - startedAt).toBeLessThan(15_000);

    redis = await startRedis(port);
    const queued = notification();
    for (let attempt = 0; attempt < 20; attempt++) {
      const ok = await channel.deliver([queued]).then(
        () => true,
        () => false,
      );
      if (ok) break;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    expect(await queue.getJob(queued._id)).toBeDefined();
  }, 60_000);

  it('still queues the job when Redis comes back within a few seconds', async () => {
    await redis!.stop();
    const queued = notification();
    const delivering = channel.deliver([queued]);
    await new Promise((resolve) => setTimeout(resolve, 2_000));
    redis = await startRedis(port);

    await expect(delivering).resolves.toBeUndefined();
    expect(await queue.getJob(queued._id)).toBeDefined();
  }, 60_000);
});

import { Queue, QueueEvents, Worker, type ConnectionOptions } from 'bullmq';
import type {
  BatchResponse,
  Messaging,
  MulticastMessage,
} from 'firebase-admin/messaging';
import type { Model } from 'mongoose';
import { randomUUID } from 'node:crypto';
import { GenericContainer, type StartedTestContainer } from 'testcontainers';
import { UserRole } from '../../src/common/enums/role.enum';
import { UserStatus } from '../../src/common/enums/user-status.enum';
import type { Actor } from '../../src/common/types/actor';
import { DevicePlatform } from '../../src/modules/notifications/constants/device-platform.enum';
import { NotificationPriority } from '../../src/modules/notifications/constants/notification-priority.enum';
import { NotificationType } from '../../src/modules/notifications/constants/notification-type.enum';
import { FcmChannel } from '../../src/modules/notifications/delivery/channels/fcm.channel';
import { NotificationPushProcessor } from '../../src/modules/notifications/delivery/push/notification-push.processor';
import type { NotificationPushJob } from '../../src/modules/notifications/delivery/push/notification-push.types';
import { UserDevicesService } from '../../src/modules/notifications/devices/user-devices.service';
import {
  Notification,
  NotificationSchema,
} from '../../src/modules/notifications/schemas/notification.schema';
import {
  UserDevice,
  UserDeviceSchema,
} from '../../src/modules/notifications/schemas/user-device.schema';
import type { DataSource } from 'typeorm';
import {
  clearAllCollections,
  startTestMongo,
  stopTestMongo,
  type TestMongo,
} from './mongo';

const QUEUE = 'notification-push-test';

describe('FCM push (MongoDB + Redis)', () => {
  let mongo: TestMongo;
  let redis: StartedTestContainer;
  let connection: ConnectionOptions;
  let notifications: Model<Notification>;
  let devices: Model<UserDevice>;
  let queue: Queue<NotificationPushJob>;
  let queueEvents: QueueEvents;
  let worker: Worker<NotificationPushJob>;
  let channel: FcmChannel;
  let outcomes: Array<Record<string, string>>;
  let sent: MulticastMessage[];

  const messaging = {
    sendEachForMulticast: (message: MulticastMessage) => {
      sent.push(message);
      const plan = outcomes.shift() ?? {};
      const responses = message.tokens.map((token) => {
        const errorCode = plan[token];
        return errorCode
          ? { success: false, error: { code: errorCode, message: errorCode } }
          : { success: true, messageId: `m-${token}` };
      });
      return Promise.resolve({
        responses,
        successCount: responses.filter((r) => r.success).length,
        failureCount: responses.filter((r) => !r.success).length,
      } as BatchResponse);
    },
  } as unknown as Messaging;

  beforeAll(async () => {
    mongo = await startTestMongo();
    notifications = mongo.connection.model(
      Notification.name,
      NotificationSchema,
    );
    devices = mongo.connection.model(UserDevice.name, UserDeviceSchema);
    await Promise.all([notifications.init(), devices.init()]);

    redis = await new GenericContainer('redis:7-alpine')
      .withExposedPorts(6379)
      .start();
    connection = { host: redis.getHost(), port: redis.getMappedPort(6379) };
    queue = new Queue(QUEUE, { connection });
    queueEvents = new QueueEvents(QUEUE, { connection });
    await queueEvents.waitUntilReady();
    channel = new FcmChannel(queue);
    const processor = new NotificationPushProcessor(
      notifications,
      devices,
      messaging,
    );
    worker = new Worker<NotificationPushJob>(
      QUEUE,
      (job) => processor.process(job),
      { connection },
    );
  });

  afterAll(async () => {
    await worker?.close();
    await queueEvents?.close();
    await queue?.close();
    await redis?.stop();
    await stopTestMongo(mongo);
  });

  beforeEach(async () => {
    await clearAllCollections(mongo.connection);
    await queue.obliterate({ force: true });
    outcomes = [];
    sent = [];
  });

  const storedNotification = async (recipientId: string) =>
    (
      await notifications.create({
        _id: randomUUID(),
        eventId: randomUUID(),
        recipientId,
        type: NotificationType.WARNING,
        priority: NotificationPriority.URGENT,
        title: 'KHẨN',
        message: 'Ngựa sốt',
        resource: null,
        readAt: null,
        createdAt: new Date(),
      })
    ).toObject<Notification>();

  const device = (token: string, userId: string) =>
    devices.create({
      _id: token,
      userId,
      platform: DevicePlatform.ANDROID,
      updatedAt: new Date(),
    });

  const deliverAndWait = async (notification: Notification) => {
    await channel.deliver([notification]);
    const job = await queue.getJob(notification._id);
    await job!.waitUntilFinished(queueEvents, 30_000);
  };

  it('pushes to every device of the recipient and removes tokens FCM reports as dead', async () => {
    const vet = randomUUID();
    await device('t-ok', vet);
    await device('t-dead', vet);
    await device('t-invalid', vet);
    await device('t-other-user', randomUUID());
    outcomes.push({
      't-dead': 'messaging/registration-token-not-registered',
      't-invalid': 'messaging/invalid-registration-token',
    });

    await deliverAndWait(await storedNotification(vet));

    expect(sent).toHaveLength(1);
    expect([...sent[0].tokens].sort()).toEqual(
      ['t-dead', 't-invalid', 't-ok'].sort(),
    );
    const left = await devices.find().lean();
    expect(left.map((d) => d._id).sort()).toEqual(['t-ok', 't-other-user']);
  });

  it('retries only the tokens that failed temporarily', async () => {
    const vet = randomUUID();
    await device('t-ok', vet);
    await device('t-flaky', vet);
    outcomes.push({ 't-flaky': 'messaging/server-unavailable' });

    await deliverAndWait(await storedNotification(vet));

    expect(sent.map((message) => [...message.tokens].sort())).toEqual([
      ['t-flaky', 't-ok'],
      ['t-flaky'],
    ]);
    expect(await devices.countDocuments()).toBe(2);
  });

  it('sends nothing when the recipient has no device', async () => {
    await deliverAndWait(await storedNotification(randomUUID()));

    expect(sent).toHaveLength(0);
  });

  it('queues a notification only once even when delivered twice', async () => {
    const vet = randomUUID();
    await device('t-ok', vet);
    const notification = await storedNotification(vet);

    await channel.deliver([notification]);
    await channel.deliver([notification]);
    const job = await queue.getJob(notification._id);
    await job!.waitUntilFinished(queueEvents, 30_000);

    expect(sent).toHaveLength(1);
  });

  describe('UserDevicesService', () => {
    const users = new Map<string, string>();
    let service: UserDevicesService;

    beforeAll(() => {
      const dataSource = {
        manager: {
          findOne: (
            _entity: unknown,
            options: { where: { keycloakId: string } },
          ) =>
            Promise.resolve({
              id: users.get(options.where.keycloakId),
              status: UserStatus.ACTIVE,
              role: UserRole.GROOM,
            }),
        },
      } as unknown as DataSource;
      service = new UserDevicesService(devices, dataSource);
    });

    const user = () => {
      const sub = randomUUID();
      const id = randomUUID();
      users.set(sub, id);
      const actor: Actor = { sub, roles: [UserRole.GROOM] };
      return { actor, id };
    };

    it('moves a token to the user who registers it last', async () => {
      const first = user();
      const second = user();

      await service.register(first.actor, {
        token: 't1',
        platform: DevicePlatform.ANDROID,
      });
      await service.register(second.actor, {
        token: 't1',
        platform: DevicePlatform.IOS,
      });

      expect(await devices.find().lean()).toEqual([
        {
          _id: 't1',
          userId: second.id,
          platform: DevicePlatform.IOS,
          updatedAt: expect.any(Date) as Date,
        },
      ]);
    });

    it('removes only a token that belongs to the caller', async () => {
      const owner = user();
      const stranger = user();
      await service.register(owner.actor, {
        token: 't1',
        platform: DevicePlatform.ANDROID,
      });

      await service.unregister(stranger.actor, 't1');
      expect(await devices.countDocuments()).toBe(1);

      await service.unregister(owner.actor, 't1');
      expect(await devices.countDocuments()).toBe(0);
    });
  });
});

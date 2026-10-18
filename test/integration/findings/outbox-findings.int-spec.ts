import { Injectable } from '@nestjs/common';
import {
  EventEmitter2,
  EventEmitterModule,
  OnEvent,
} from '@nestjs/event-emitter';
import { Test, type TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Queue } from 'bullmq';
import type { Model } from 'mongoose';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { GenericContainer, type StartedTestContainer } from 'testcontainers';
import { DataSource } from 'typeorm';
import { UserRole } from '../../../src/common/enums/role.enum';
import { DomainEventPublisher } from '../../../src/common/infrastructure/events/domain-event.publisher';
import {
  OUTBOX_LISTENER_OPTIONS,
  OUTBOX_MAX_ATTEMPTS,
} from '../../../src/common/infrastructure/events/outbox.constants';
import { OutboxEventEntity } from '../../../src/common/infrastructure/events/outbox-event.entity';
import { OutboxRelayService } from '../../../src/common/infrastructure/events/outbox-relay.service';
import {
  MEDICAL_CASE_CLOSED_EVENT,
  MEDICAL_TRAINING_LOCK_RELEASED_EVENT,
  MEDICAL_TRAINING_LOCK_SET_EVENT,
} from '../../../src/modules/medical/constants/medical-events.constants';
import { MedicalEventsListener } from '../../../src/modules/notifications/delivery/medical-events.listener';
import { MedicalNotificationsService } from '../../../src/modules/notifications/delivery/medical-notifications.service';
import { NotificationDeliveryService } from '../../../src/modules/notifications/delivery/notification-delivery.service';
import { NotificationRecipientsRepository } from '../../../src/modules/notifications/delivery/notification-recipients.repository';
import { PushChannel } from '../../../src/modules/notifications/delivery/push.channel';
import {
  NotificationRecord,
  NotificationSchema,
} from '../../../src/modules/notifications/schemas/notification.schema';
import type { NotificationPushJob } from '../../../src/modules/notifications/types/notification.types';
import { startContainerWithRetry } from '../container';
import { fixtures } from '../fixtures';
import {
  clearAllMongoCollections,
  startTestMongo,
  stopTestMongo,
  type TestMongo,
} from '../mongo';
import {
  startTestPostgres,
  stopTestPostgres,
  truncateAllTables,
  type TestPostgres,
} from '../postgres';

/**
 * Lỗi giả lập theo eventId: Mongo (bulkWrite) và Redis (addBulk)
 */
const faults = {
  mongoFailEventIds: new Map<string, number>(),
  redisFailuresLeft: 0,
};

/**
 * Listener thứ hai của MEDICAL_TRAINING_LOCK_SET_EVENT (vai trò như ParticipantEligibilityListener)
 */
@Injectable()
class SecondLockListener {
  failuresLeft = 0;
  payloads: Array<Record<string, unknown>> = [];

  @OnEvent(MEDICAL_TRAINING_LOCK_SET_EVENT, OUTBOX_LISTENER_OPTIONS)
  handle(payload: Record<string, unknown>): Promise<void> {
    this.payloads.push(payload);
    if (this.failuresLeft > 0) {
      this.failuresLeft--;
      return Promise.reject(new Error('second listener down'));
    }
    return Promise.resolve();
  }
}

describe('Outbox findings (Postgres + Mongo + Redis)', () => {
  let db: TestPostgres;
  let dataSource: DataSource;
  let mongo: TestMongo;
  let redis: StartedTestContainer;
  let queue: Queue<NotificationPushJob>;
  let notifications: Model<NotificationRecord>;
  let moduleRef: TestingModule;
  let publisher: DomainEventPublisher;
  let relay: OutboxRelayService;
  let second: SecondLockListener;
  let f: ReturnType<typeof fixtures>;

  beforeAll(async () => {
    db = await startTestPostgres();
    dataSource = db.dataSource;
    mongo = await startTestMongo();
    notifications = mongo.connection.model(
      NotificationRecord.name,
      NotificationSchema,
    );
    await notifications.init();
    redis = await startContainerWithRetry(() =>
      new GenericContainer('redis:7-alpine').withExposedPorts(6379).start(),
    );
    queue = new Queue('outbox-findings-push', {
      connection: { host: redis.getHost(), port: redis.getMappedPort(6379) },
    });

    const flakyModel = new Proxy(notifications, {
      get(target, prop, receiver) {
        if (prop === 'bulkWrite') {
          return (
            ops: Array<{ updateOne: { filter: { eventId: string } } }>,
          ) => {
            const eventId = ops[0]?.updateOne.filter.eventId;
            const left = faults.mongoFailEventIds.get(eventId) ?? 0;
            if (left > 0) {
              faults.mongoFailEventIds.set(eventId, left - 1);
              return Promise.reject(new Error('MongoServerSelectionError'));
            }
            return target.bulkWrite(ops as never, { ordered: false });
          };
        }
        return Reflect.get(target, prop, receiver) as unknown;
      },
    });
    const flakyQueue = new Proxy(queue, {
      get(target, prop, receiver) {
        if (prop === 'addBulk') {
          return (jobs: Parameters<Queue['addBulk']>[0]) => {
            if (faults.redisFailuresLeft > 0) {
              faults.redisFailuresLeft--;
              return Promise.reject(new Error('ECONNREFUSED redis'));
            }
            return target.addBulk(jobs);
          };
        }
        return Reflect.get(target, prop, receiver) as unknown;
      },
    });

    moduleRef = await Test.createTestingModule({
      imports: [EventEmitterModule.forRoot()],
      providers: [
        { provide: DataSource, useValue: dataSource },
        {
          provide: getRepositoryToken(OutboxEventEntity),
          useValue: dataSource.getRepository(OutboxEventEntity),
        },
        DomainEventPublisher,
        OutboxRelayService,
        NotificationRecipientsRepository,
        {
          provide: NotificationDeliveryService,
          useFactory: () =>
            new NotificationDeliveryService(flakyModel, [
              new PushChannel(flakyQueue),
            ]),
        },
        MedicalNotificationsService,
        MedicalEventsListener,
        SecondLockListener,
      ],
    }).compile();
    await moduleRef.init();
    publisher = moduleRef.get(DomainEventPublisher);
    relay = moduleRef.get(OutboxRelayService);
    second = moduleRef.get(SecondLockListener);
    f = fixtures(dataSource);
  });

  afterAll(async () => {
    await moduleRef?.close();
    await queue?.close();
    await redis?.stop();
    await stopTestMongo(mongo);
    await stopTestPostgres(db);
  });

  beforeEach(async () => {
    await truncateAllTables(dataSource);
    await clearAllMongoCollections(mongo.connection);
    await queue.obliterate({ force: true });
    faults.mongoFailEventIds.clear();
    faults.redisFailuresLeft = 0;
    second.failuresLeft = 0;
    second.payloads = [];
  });

  const makeDue = () =>
    dataSource.query(`UPDATE outbox_events SET next_attempt_at = now()`);

  const outboxRows = () =>
    dataSource.query<
      Array<{
        payload: Record<string, unknown>;
        attempts: number;
        processed_at: Date | null;
        dead_at: Date | null;
        next_attempt_at: Date;
        last_error: string | null;
      }>
    >(`SELECT * FROM outbox_events ORDER BY created_at`);

  const pushJobs = async () =>
    (await queue.getJobs(['waiting', 'delayed', 'active', 'completed'])).length;

  /**
   * Ngựa có khu (kèm Head Trainer), chủ ngựa và một Club Manager
   */
  const scene = async () => {
    const ht = await f.user(UserRole.HEAD_TRAINER);
    const cm = await f.user(UserRole.CLUB_MANAGER);
    const owner = await f.user(UserRole.HORSE_OWNER);
    const barnId = await f.barn(`Khu ${randomUUID().slice(0, 6)}`);
    await dataSource.query(
      `UPDATE barns SET head_trainer_id = $1 WHERE id = $2`,
      [ht, barnId],
    );
    const horseId = await f.horse('Gió', { barnId, ownerId: owner });
    return { ht, cm, owner, barnId, horseId };
  };

  const lockSet = (horseId: string) => ({
    eventId: randomUUID(),
    horseId,
    lockId: randomUUID(),
    reason: 'Viêm gân',
    expectedEnd: '2026-11-01T00:00:00.000Z',
  });

  const publish = (name: string, payload: object) =>
    dataSource.transaction((manager) =>
      publisher.publish(manager, name, payload),
    );

  it('OB-1 rollback after publish leaves no outbox row and no notification', async () => {
    const { horseId } = await scene();
    await expect(
      dataSource.transaction(async (manager) => {
        await publisher.publish(
          manager,
          MEDICAL_TRAINING_LOCK_SET_EVENT,
          lockSet(horseId),
        );
        throw new Error('policy 409');
      }),
    ).rejects.toThrow('policy 409');

    await relay.relayBatch();
    expect(await outboxRows()).toEqual([]);
    expect(await notifications.countDocuments()).toBe(0);
    expect(await pushJobs()).toBe(0);
  });

  it('OB-2 redelivery after listener ran (crash before processed_at) yields one notification and one push job per recipient', async () => {
    const { horseId } = await scene();
    await publish(MEDICAL_TRAINING_LOCK_SET_EVENT, lockSet(horseId));
    await relay.relayBatch();
    await dataSource.query(
      `UPDATE outbox_events SET processed_at = NULL, next_attempt_at = now()`,
    );
    await relay.relayBatch();

    expect(await notifications.countDocuments()).toBe(2);
    expect(await pushJobs()).toBe(2);
  });

  it('OB-2b Mongo saved but push enqueue failed (Redis blip) → push still enqueued on a later attempt', async () => {
    const { horseId } = await scene();
    faults.redisFailuresLeft = 1;
    await publish(MEDICAL_TRAINING_LOCK_SET_EVENT, lockSet(horseId));
    await relay.relayBatch();
    await makeDue();
    await relay.relayBatch();

    const [row] = await outboxRows();
    expect(await notifications.countDocuments()).toBe(2);
    expect({
      processed: row.processed_at !== null,
      jobs: await pushJobs(),
    }).toEqual({ processed: true, jobs: 2 });
  });

  it('OB-3 failing event backs off then dies after max attempts; other events keep flowing', async () => {
    const { horseId } = await scene();
    const bad = lockSet(horseId);
    const good = lockSet(horseId);
    faults.mongoFailEventIds.set(bad.eventId, 1000);
    await publish(MEDICAL_TRAINING_LOCK_SET_EVENT, bad);
    await publish(MEDICAL_TRAINING_LOCK_SET_EVENT, good);

    await relay.relayBatch();
    const [badRow, goodRow] = await outboxRows();
    expect(goodRow.processed_at).toBeInstanceOf(Date);
    expect(badRow.processed_at).toBeNull();
    expect(badRow.last_error).toContain('MongoServerSelectionError');
    expect(badRow.next_attempt_at.getTime()).toBeGreaterThan(Date.now());
    expect(await notifications.countDocuments({ eventId: good.eventId })).toBe(
      2,
    );

    for (let i = 1; i < OUTBOX_MAX_ATTEMPTS; i++) {
      await makeDue();
      await relay.relayBatch();
    }
    const [dead] = await outboxRows();
    expect(dead.attempts).toBe(OUTBOX_MAX_ATTEMPTS);
    expect(dead.dead_at).toBeInstanceOf(Date);
    await makeDue();
    await expect(relay.relayBatch()).resolves.toBe(0);
  });

  it('OB-4 two relay replicas in parallel handle each event once (no duplicate notification or push)', async () => {
    const { horseId } = await scene();
    for (let n = 0; n < 30; n++) {
      await publish(MEDICAL_TRAINING_LOCK_SET_EVENT, lockSet(horseId));
    }
    const replica = new OutboxRelayService(
      dataSource.getRepository(OutboxEventEntity),
      moduleRef.get(EventEmitter2),
    );
    await Promise.all([relay.relayDueEvents(), replica.relayDueEvents()]);

    const rows = await outboxRows();
    expect(rows.every((r) => r.processed_at && r.attempts === 1)).toBe(true);
    expect(second.payloads).toHaveLength(30);
    expect(await notifications.countDocuments()).toBe(60);
    expect(await pushJobs()).toBe(60);
  });

  it('OB-5 listener A ok + listener B fails → retry does not duplicate A side effects', async () => {
    const { horseId } = await scene();
    second.failuresLeft = 1;
    await publish(MEDICAL_TRAINING_LOCK_SET_EVENT, lockSet(horseId));
    await relay.relayBatch();
    expect((await outboxRows())[0].processed_at).toBeNull();
    await makeDue();
    await relay.relayBatch();

    expect((await outboxRows())[0].processed_at).toBeInstanceOf(Date);
    expect(second.payloads).toHaveLength(2);
    expect(await notifications.countDocuments()).toBe(2);
    expect(await pushJobs()).toBe(2);
  });

  it('OB-6 lock set then released: newest notification of the lock must be the release even if set was retried', async () => {
    const { horseId, ht } = await scene();
    const set = lockSet(horseId);
    faults.mongoFailEventIds.set(set.eventId, 1);
    await publish(MEDICAL_TRAINING_LOCK_SET_EVENT, set);
    await publish(MEDICAL_TRAINING_LOCK_RELEASED_EVENT, {
      eventId: randomUUID(),
      horseId,
      lockId: set.lockId,
      conclusion: 'Hồi phục',
    });
    await relay.relayBatch();
    await makeDue();
    await relay.relayBatch();

    const latest = await notifications
      .findOne({ recipientId: ht, 'resource.id': set.lockId })
      .sort({ createdAt: -1, _id: -1 })
      .lean();
    expect(latest?.title).toContain('được gỡ khóa');
  });

  it('OB-7 payload contract: eventId stable across retries, timestamps ISO strings, every *Event type has eventId and no Date', async () => {
    const { horseId } = await scene();
    const payload = lockSet(horseId);
    faults.mongoFailEventIds.set(payload.eventId, 1);
    await publish(MEDICAL_TRAINING_LOCK_SET_EVENT, payload);
    await relay.relayBatch();
    await makeDue();
    await relay.relayBatch();
    expect(second.payloads.map((p) => p.eventId)).toEqual([
      payload.eventId,
      payload.eventId,
    ]);
    expect(typeof second.payloads[1].expectedEnd).toBe('string');

    const root = join(__dirname, '../../../src/modules');
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) walk(p);
        else if (/types\/.*\.types\.ts$/.test(p)) files.push(p);
      }
    };
    walk(root);
    const violations: string[] = [];
    for (const file of files) {
      const src = readFileSync(file, 'utf8');
      const re = /export (?:interface|type) (\w+Event)\b[^{]*\{([\s\S]*?)\n\}/g;
      for (const m of src.matchAll(re)) {
        if (/:\s*Date\b/.test(m[2])) violations.push(`${m[1]}: Date field`);
        const extendsBase = /extends \w*EventBase/.test(m[0]);
        if (!/\beventId\b/.test(m[2]) && !extendsBase) {
          violations.push(`${m[1]}: no eventId`);
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it('OB-8 owner changes between publish and delivery → old owner (owner at event time) is told, new owner is not', async () => {
    const { horseId, owner } = await scene();
    const newOwner = await f.user(UserRole.HORSE_OWNER);
    await publish(MEDICAL_CASE_CLOSED_EVENT, {
      eventId: randomUUID(),
      horseId,
      caseId: randomUUID(),
      totalCost: 15_000_000,
      ownerId: owner,
      ownerCost: 15_000_000,
    });
    await dataSource.query(`UPDATE horses SET owner_id = $1 WHERE id = $2`, [
      newOwner,
      horseId,
    ]);
    await relay.relayBatch();

    const got = async (id: string) =>
      (await notifications.countDocuments({ recipientId: id })) > 0;
    expect({
      oldOwner: await got(owner),
      newOwner: await got(newOwner),
    }).toEqual({ oldOwner: true, newOwner: false });
  });

  it('OB-9 processed rows older than retention are purged; pending rows kept', async () => {
    await dataSource.query(
      `INSERT INTO outbox_events (event_name, payload, processed_at)
       VALUES ('x', '{}', now() - interval '8 days'),
              ('x', '{}', now() - interval '1 day'),
              ('x', '{}', NULL)`,
    );
    await relay.purgeProcessedEvents();
    const rows = await outboxRows();
    expect(rows).toHaveLength(2);
    expect(rows.some((r) => r.processed_at === null)).toBe(true);
  });
});

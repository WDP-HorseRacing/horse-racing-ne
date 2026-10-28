import { Injectable } from '@nestjs/common';
import {
  EventEmitter2,
  EventEmitterModule,
  OnEvent,
} from '@nestjs/event-emitter';
import { Test, type TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { DomainEventPublisher } from '../../src/common/infrastructure/events/domain-event.publisher';
import {
  OUTBOX_LISTENER_OPTIONS,
  OUTBOX_MAX_ATTEMPTS,
} from '../../src/common/infrastructure/events/outbox.constants';
import { OutboxEventEntity } from '../../src/common/infrastructure/events/outbox-event.entity';
import { OutboxRelayService } from '../../src/common/infrastructure/events/outbox-relay.service';
import {
  startTestPostgres,
  stopTestPostgres,
  truncateAllTables,
  type TestPostgres,
} from './postgres';

const TEST_EVENT = 'test.outbox.happened';

/**
 * Listener thử: ghi lại payload nhận được; failuresLeft > 0 thì ném lỗi rồi giảm dần
 */
@Injectable()
class RecordingListener {
  received: Array<Record<string, unknown>> = [];
  failuresLeft = 0;
  delayMs = 0;

  @OnEvent(TEST_EVENT, OUTBOX_LISTENER_OPTIONS)
  async handle(payload: Record<string, unknown>): Promise<void> {
    if (this.delayMs) {
      await new Promise((resolve) => setTimeout(resolve, this.delayMs));
    }
    if (this.failuresLeft > 0) {
      this.failuresLeft--;
      throw new Error('listener down');
    }
    this.received.push(payload);
  }
}

interface OutboxRow {
  attempts: number;
  processed_at: Date | null;
  dead_at: Date | null;
  last_error: string | null;
  next_attempt_at: Date;
}

describe('Outbox (Postgres + Nest event emitter)', () => {
  let db: TestPostgres;
  let dataSource: DataSource;
  let moduleRef: TestingModule;
  let publisher: DomainEventPublisher;
  let relay: OutboxRelayService;
  let listener: RecordingListener;

  beforeAll(async () => {
    db = await startTestPostgres();
    dataSource = db.dataSource;
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
        RecordingListener,
      ],
    }).compile();
    await moduleRef.init();
    publisher = moduleRef.get(DomainEventPublisher);
    relay = moduleRef.get(OutboxRelayService);
    listener = moduleRef.get(RecordingListener);
  });

  afterAll(async () => {
    await moduleRef?.close();
    await stopTestPostgres(db);
  });

  beforeEach(async () => {
    await truncateAllTables(dataSource);
    listener.received = [];
    listener.failuresLeft = 0;
    listener.delayMs = 0;
  });

  const rows = () =>
    dataSource.query<OutboxRow[]>(
      `SELECT attempts, processed_at, dead_at, last_error, next_attempt_at
         FROM outbox_events ORDER BY created_at`,
    );

  const makeDue = () =>
    dataSource.query(`UPDATE outbox_events SET next_attempt_at = now()`);

  it('stores nothing when the business transaction rolls back', async () => {
    await expect(
      dataSource.transaction(async (manager) => {
        await publisher.publish(manager, TEST_EVENT, { n: 1 });
        throw new Error('business rule failed');
      }),
    ).rejects.toThrow('business rule failed');

    expect(await rows()).toEqual([]);
  });

  it('delivers a committed event with the same JSON payload and marks it processed', async () => {
    const payload = {
      eventId: 'e1',
      expectedEnd: '2026-10-05T17:00:00.000Z',
      nested: { list: [1, 'a', null] },
      flag: false,
    };
    await dataSource.transaction((manager) =>
      publisher.publish(manager, TEST_EVENT, payload),
    );

    await expect(relay.relayBatch()).resolves.toBe(1);

    expect(listener.received).toEqual([payload]);
    const [row] = await rows();
    expect(row.processed_at).toBeInstanceOf(Date);
    expect(row.attempts).toBe(1);
  });

  it('keeps a failed event for a later retry, then delivers it', async () => {
    listener.failuresLeft = 1;
    await dataSource.transaction((manager) =>
      publisher.publish(manager, TEST_EVENT, { eventId: 'e1' }),
    );

    await relay.relayBatch();
    const [failed] = await rows();
    expect(failed).toMatchObject({ attempts: 1, processed_at: null });
    expect(failed.last_error).toContain('listener down');
    expect(failed.next_attempt_at.getTime()).toBeGreaterThan(Date.now());
    await expect(relay.relayBatch()).resolves.toBe(0);

    await makeDue();
    await relay.relayBatch();

    expect(listener.received).toEqual([{ eventId: 'e1' }]);
    const [done] = await rows();
    expect(done).toMatchObject({ attempts: 2, last_error: null });
    expect(done.processed_at).toBeInstanceOf(Date);
  });

  it('gives up after the maximum number of attempts', async () => {
    listener.failuresLeft = OUTBOX_MAX_ATTEMPTS + 5;
    await dataSource.transaction((manager) =>
      publisher.publish(manager, TEST_EVENT, { eventId: 'e1' }),
    );

    for (let attempt = 0; attempt < OUTBOX_MAX_ATTEMPTS; attempt++) {
      await makeDue();
      await relay.relayBatch();
    }
    await makeDue();

    await expect(relay.relayBatch()).resolves.toBe(0);
    const [row] = await rows();
    expect(row.attempts).toBe(OUTBOX_MAX_ATTEMPTS);
    expect(row.dead_at).toBeInstanceOf(Date);
    expect(row.processed_at).toBeNull();
  });

  it('marks an event without listeners as processed', async () => {
    await dataSource.transaction((manager) =>
      publisher.publish(manager, 'test.outbox.nobody-listens', { n: 1 }),
    );

    await relay.relayBatch();

    const [row] = await rows();
    expect(row.processed_at).toBeInstanceOf(Date);
  });

  it('delivers each event once when two relays run at the same time', async () => {
    listener.delayMs = 20;
    await dataSource.transaction(async (manager) => {
      for (let n = 0; n < 30; n++) {
        await publisher.publish(manager, TEST_EVENT, { n });
      }
    });
    const second = new OutboxRelayService(
      dataSource.getRepository(OutboxEventEntity),
      moduleRef.get(EventEmitter2),
    );

    await Promise.all([relay.relayDueEvents(), second.relayDueEvents()]);

    const delivered = listener.received
      .map((payload) => payload.n)
      .sort((a, b) => (a as number) - (b as number));
    expect(delivered).toEqual(Array.from({ length: 30 }, (_, n) => n));
    const all = await rows();
    expect(all.every((row) => row.processed_at && row.attempts === 1)).toBe(
      true,
    );
  });
});

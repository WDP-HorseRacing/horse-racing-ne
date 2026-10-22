import { HttpException } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { Test, type TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { UserRole } from '../../src/common/enums/role.enum';
import { DomainEventPublisher } from '../../src/common/infrastructure/events/domain-event.publisher';
import { DomainEventsModule } from '../../src/common/infrastructure/events/domain-events.module';
import type { Actor } from '../../src/common/types/actor';
import { clubToday, shiftDays } from '../../src/common/utils/club-date';
import { AuditService } from '../../src/modules/audit/services/audit.service';
import { HorseAccessService } from '../../src/modules/horses/shared/horse-access.service';
import { CareTasksModule } from '../../src/modules/stable/care-tasks/care-tasks.module';
import { CareTasksService } from '../../src/modules/stable/care-tasks/care-tasks.service';
import { FeedingMeal } from '../../src/modules/stable/constants/feeding-meal.enum';
import { FeedingPlanEntity } from '../../src/modules/stable/entities/feeding-plan.entity';
import { FeedingPlansService } from '../../src/modules/stable/feeding-plans/feeding-plans.service';
import { StableAccessService } from '../../src/modules/stable/shared/stable-access.service';
import { SupplyItemEntity } from '../../src/modules/supplies/entities/supply-item.entity';
import { SupplyLotEntity } from '../../src/modules/supplies/entities/supply-lot.entity';
import { SupplyStockMovementEntity } from '../../src/modules/supplies/entities/supply-stock-movement.entity';
import { SupplyCategory } from '../../src/modules/supplies/enums/supply-category.enum';
import { SupplyItemsService } from '../../src/modules/supplies/items/items.service';
import { SupplyStockService } from '../../src/modules/supplies/shared/supply-stock.service';
import { fixtures } from './fixtures';
import {
  startTestPostgres,
  truncateAllTables,
  type TestPostgres,
} from './postgres';

/** Kết quả một thao tác: 'ok', mã HTTP của lỗi domain, hoặc tên lớp lỗi thô kèm mã SQL */
type Outcome = number | string;

describe('Stable care races (Postgres, concurrent transactions)', () => {
  let db: TestPostgres;
  let dataSource: DataSource;
  let moduleRef: TestingModule;
  let seed: ReturnType<typeof fixtures>;
  let careTasks: CareTasksService;
  let plans: FeedingPlansService;
  let items: SupplyItemsService;
  let cm: Actor;
  let trainer: Actor;
  let trainerId: string;
  let horseId: string;
  let today: string;

  const actorOf = async (id: string, role: UserRole): Promise<Actor> => {
    const [row] = await dataSource.query<{ keycloak_id: string }[]>(
      'SELECT keycloak_id FROM users WHERE id = $1',
      [id],
    );
    return { sub: row.keycloak_id, roles: [role] };
  };

  const settle = (promise: Promise<unknown>): Promise<Outcome> =>
    promise.then(
      () => 'ok',
      (error: {
        constructor?: { name: string };
        driverError?: { code?: string };
      }) =>
        error instanceof HttpException
          ? error.getStatus()
          : `${error?.constructor?.name}(${error?.driverError?.code ?? '-'})`,
    );

  const waitingOnLock = async () => {
    const [row] = await dataSource.query<{ n: number }[]>(
      `SELECT count(*)::int AS n FROM pg_stat_activity
        WHERE datname = current_database() AND wait_event_type = 'Lock'`,
    );
    return row.n;
  };

  const waitBlocked = async (count: number) => {
    for (let i = 0; i < 300; i++) {
      if ((await waitingOnLock()) >= count) return;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    throw new Error(
      `setup: expected ${count} transaction(s) waiting on a lock`,
    );
  };

  /**
   * Giữ row lock ở một kết nối riêng để `first` dừng giữa chừng, rồi bắn `second`.
   * Trả về thứ tự hai thao tác kết thúc và kết quả của từng thao tác.
   */
  const interleave = async (
    lockSql: string,
    params: unknown[],
    first: () => Promise<unknown>,
    second: () => Promise<unknown>,
  ) => {
    const finished: string[] = [];
    const holder = dataSource.createQueryRunner();
    await holder.connect();
    await holder.startTransaction();
    await holder.query(lockSql, params);
    let firstDone: Promise<Outcome>;
    let secondDone: Promise<Outcome>;
    try {
      firstDone = settle(first()).finally(() => finished.push('first'));
      await waitBlocked(1);
      secondDone = settle(second()).finally(() => finished.push('second'));
      for (let i = 0; i < 300 && finished.length === 0; i++) {
        if ((await waitingOnLock()) >= 2) break;
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
    } finally {
      await holder.rollbackTransaction();
      await holder.release();
    }
    return {
      first: await firstDone,
      second: await secondDone,
      finished,
    };
  };

  beforeAll(async () => {
    db = await startTestPostgres();
    dataSource = db.dataSource;
    seed = fixtures(dataSource);
    moduleRef = await Test.createTestingModule({
      imports: [
        EventEmitterModule.forRoot(),
        TypeOrmModule.forRootAsync({
          useFactory: () => ({ type: 'postgres' }),
          dataSourceFactory: () => Promise.resolve(dataSource),
        }),
        DomainEventsModule,
        CareTasksModule,
      ],
    }).compile();
    careTasks = moduleRef.get(CareTasksService);
    const audit = new AuditService();
    plans = new FeedingPlansService(
      dataSource.getRepository(FeedingPlanEntity),
      new StableAccessService(new HorseAccessService(dataSource)),
      dataSource,
      audit,
    );
    items = new SupplyItemsService(
      dataSource.getRepository(SupplyItemEntity),
      dataSource.getRepository(SupplyStockMovementEntity),
      dataSource.getRepository(SupplyLotEntity),
      new SupplyStockService(),
      dataSource,
      audit,
      new DomainEventPublisher(),
    );
  });

  afterAll(async () => {
    await moduleRef?.close();
    await db?.container.stop();
  });

  beforeEach(async () => {
    await truncateAllTables(dataSource);
    today = clubToday();
    cm = await actorOf(
      await seed.user(UserRole.CLUB_MANAGER),
      UserRole.CLUB_MANAGER,
    );
    trainerId = await seed.user(UserRole.HEAD_TRAINER);
    trainer = await actorOf(trainerId, UserRole.HEAD_TRAINER);
    const barnId = await seed.barn('Khu A');
    await dataSource.query(
      'UPDATE barns SET head_trainer_id = $1 WHERE id = $2',
      [trainerId, barnId],
    );
    horseId = await seed.horse('Gió', { barnId });
  });

  it('removing the same horse care task twice at once: one 404, one DELETE audit row', async () => {
    const [type] = await dataSource.query<{ id: string }[]>(
      `INSERT INTO daily_task_types (version, name, applies_to_all, active) VALUES (1, 'Chườm đá', false, true) RETURNING id`,
    );
    const [task] = await dataSource.query<{ id: string }[]>(
      `INSERT INTO horse_daily_tasks (horse_id, task_type_id, from_date, to_date, created_by)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [horseId, type.id, shiftDays(today, 1), shiftDays(today, 5), trainerId],
    );
    const remove = () => careTasks.removeForHorse(trainer, task.id);

    const result = await interleave(
      'SELECT 1 FROM horses WHERE id = $1 FOR UPDATE',
      [horseId],
      remove,
      remove,
    );
    const [audits] = await dataSource.query<{ n: number }[]>(
      `SELECT count(*)::int AS n FROM audit_logs WHERE entity_id = $1 AND action = 'DELETE'`,
      [task.id],
    );

    expect([result.first, result.second].map(String).sort()).toEqual([
      '404',
      'ok',
    ]);
    expect(audits.n).toBe(1);
  });

  it('a task type deactivated while it is being attached waits for the attach to commit', async () => {
    const [type] = await dataSource.query<{ id: string }[]>(
      `INSERT INTO daily_task_types (version, name, applies_to_all, active) VALUES (1, 'Chườm đá', false, true) RETURNING id`,
    );

    const result = await interleave(
      'SELECT 1 FROM users WHERE id = $1 FOR UPDATE',
      [trainerId],
      () =>
        careTasks.createForHorse(trainer, horseId, {
          taskTypeId: type.id,
          fromDate: shiftDays(today, 1),
          toDate: shiftDays(today, 3),
        }),
      () => careTasks.updateType(cm, type.id, { active: false }),
    );

    expect(result).toEqual({
      first: 'ok',
      second: 'ok',
      finished: ['first', 'second'],
    });
  });

  it('a supply deleted while a ration is being approved waits for the approval to commit', async () => {
    const [oats] = await dataSource.query<{ id: string }[]>(
      `INSERT INTO supply_items (version, name, category, unit) VALUES (1, 'Yến mạch', $1, 'kg') RETURNING id`,
      [SupplyCategory.FEED],
    );
    const [active] = await plans.create(trainer, {
      horseIds: [horseId],
      items: [{ meal: FeedingMeal.NOON, supplyItemId: oats.id, quantity: 2 }],
    });
    await plans.approve(trainer, active.id);
    const [draft] = await plans.create(trainer, {
      horseIds: [horseId],
      items: [{ meal: FeedingMeal.NOON, supplyItemId: oats.id, quantity: 3 }],
    });

    const result = await interleave(
      'SELECT 1 FROM feeding_plans WHERE id = $1 FOR UPDATE',
      [active.id],
      () => plans.approve(trainer, draft.id),
      () => items.remove(cm, oats.id),
    );

    expect(result).toEqual({
      first: 'ok',
      second: 'ok',
      finished: ['first', 'second'],
    });
  });

  it('approving a ration after its supply was deleted is 409', async () => {
    const [oats] = await dataSource.query<{ id: string }[]>(
      `INSERT INTO supply_items (version, name, category, unit) VALUES (1, 'Yến mạch', $1, 'kg') RETURNING id`,
      [SupplyCategory.FEED],
    );
    const [draft] = await plans.create(trainer, {
      horseIds: [horseId],
      items: [{ meal: FeedingMeal.NOON, supplyItemId: oats.id, quantity: 3 }],
    });
    await items.remove(cm, oats.id);

    await expect(plans.approve(trainer, draft.id)).rejects.toMatchObject({
      status: 409,
    });
  });
});

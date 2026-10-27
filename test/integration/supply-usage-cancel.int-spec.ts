import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { PaginationQueryDto } from '../../src/common/dto/pagination-query.dto';
import { UserRole } from '../../src/common/enums/role.enum';
import { DomainEventPublisher } from '../../src/common/infrastructure/events/domain-event.publisher';
import type { Actor } from '../../src/common/types/actor';
import { AuditService } from '../../src/modules/audit/services/audit.service';
import { FinanceReportsRepository } from '../../src/modules/reports/finance-reports/finance-reports.repository';
import { CancelSupplyUsageDto } from '../../src/modules/supplies/dto/supply-item.dto';
import { SupplyItemEntity } from '../../src/modules/supplies/entities/supply-item.entity';
import { SupplyLotEntity } from '../../src/modules/supplies/entities/supply-lot.entity';
import { SupplyStockMovementEntity } from '../../src/modules/supplies/entities/supply-stock-movement.entity';
import { SupplyCategory } from '../../src/modules/supplies/enums/supply-category.enum';
import { SupplyStockMovementType } from '../../src/modules/supplies/enums/supply-stock-movement-type.enum';
import { SupplyItemsService } from '../../src/modules/supplies/items/items.service';
import { SupplyStockService } from '../../src/modules/supplies/shared/supply-stock.service';
import { fixtures } from './fixtures';
import {
  startTestPostgres,
  stopTestPostgres,
  truncateAllTables,
  type TestPostgres,
} from './postgres';

describe('Cancelling a supply usage (Postgres)', () => {
  let db: TestPostgres;
  let dataSource: DataSource;
  let seed: ReturnType<typeof fixtures>;
  let items: SupplyItemsService;
  let manager: Actor;
  let groom: Actor;
  let otherGroom: Actor;
  let itemId: string;

  const actorOf = async (role: UserRole): Promise<Actor> => {
    const id = await seed.user(role);
    const [row] = await dataSource.query<{ keycloak_id: string }[]>(
      'SELECT keycloak_id FROM users WHERE id = $1',
      [id],
    );
    return { sub: row.keycloak_id, roles: [role] };
  };

  const page = (): PaginationQueryDto =>
    Object.assign(new PaginationQueryDto(), { page: 1, limit: 50 });

  const lastUsageId = async () => {
    const [row] = await dataSource.query<{ usage_id: string }[]>(
      `SELECT usage_id FROM supply_stock_movements
        WHERE type = 'USAGE' ORDER BY created_at DESC LIMIT 1`,
    );
    return row.usage_id;
  };

  const lotsLeft = async () =>
    (await items.lotsOf(manager, itemId)).map((lot) => lot.remaining);

  const reason = { reason: 'Ghi nhầm số lượng' };

  beforeAll(async () => {
    db = await startTestPostgres();
    dataSource = db.dataSource;
    seed = fixtures(dataSource);
    items = new SupplyItemsService(
      dataSource.getRepository(SupplyItemEntity),
      dataSource.getRepository(SupplyStockMovementEntity),
      dataSource.getRepository(SupplyLotEntity),
      new SupplyStockService(),
      dataSource,
      new AuditService(),
      new DomainEventPublisher(),
    );
  });

  afterAll(() => stopTestPostgres(db));

  beforeEach(async () => {
    await truncateAllTables(dataSource);
    manager = await actorOf(UserRole.CLUB_MANAGER);
    groom = await actorOf(UserRole.GROOM);
    otherGroom = await actorOf(UserRole.GROOM);
    itemId = (
      await items.create(manager, {
        name: 'Băng gạc',
        category: SupplyCategory.EQUIPMENT,
        unit: 'cuộn',
        reorderThreshold: 5,
      })
    ).id;
    await items.receive(manager, itemId, { quantity: 20, unitPrice: 20000 });
    await items.receive(manager, itemId, { quantity: 30, unitPrice: 15000 });
  });

  it('puts back what a usage took from each lot and marks it cancelled in the ledger', async () => {
    await items.use(groom, itemId, { quantity: 25, note: 'Dùng' });
    expect(await lotsLeft()).toEqual([0, 25]);
    const usageId = await lastUsageId();

    const item = await items.cancelUsage(groom, usageId, reason);

    expect(item.quantityOnHand).toBe(50);
    expect(await lotsLeft()).toEqual([20, 30]);
    const ledger = (await items.movementsOf(manager, itemId, page())).items;
    expect(
      ledger
        .filter((row) => row.usageId === usageId)
        .map((row) => [row.type, row.delta, row.cancelled, row.note])
        .sort(),
    ).toEqual(
      [
        [SupplyStockMovementType.USAGE, -20, true, 'Dùng'],
        [SupplyStockMovementType.USAGE, -5, true, 'Dùng'],
        [SupplyStockMovementType.USAGE_REVERSAL, 20, false, reason.reason],
        [SupplyStockMovementType.USAGE_REVERSAL, 5, false, reason.reason],
      ].sort(),
    );
    await expect(
      dataSource.query(
        `SELECT reason, after_data->>'cancelledUsageId' AS "usageId" FROM audit_logs
          WHERE feature = 'SUPPLY_STOCK' AND after_data ? 'cancelledUsageId'`,
      ),
    ).resolves.toEqual([{ reason: reason.reason, usageId }]);
  });

  it('refuses to cancel the same usage twice, also when both run at once', async () => {
    await items.use(groom, itemId, { quantity: 25, note: 'Dùng' });
    const usageId = await lastUsageId();

    const results = await Promise.allSettled([
      items.cancelUsage(groom, usageId, reason),
      items.cancelUsage(manager, usageId, reason),
    ]);

    expect(results.map((result) => result.status).sort()).toEqual([
      'fulfilled',
      'rejected',
    ]);
    await expect(items.cancelUsage(manager, usageId, reason)).rejects.toThrow(
      new ConflictException('Lần xuất này đã được hủy'),
    );
    expect(await lotsLeft()).toEqual([20, 30]);
  });

  it('lets only the one who used it cancel within 24 hours, and the club manager any time', async () => {
    await items.use(groom, itemId, { quantity: 5, note: 'Dùng' });
    const usageId = await lastUsageId();

    await expect(
      items.cancelUsage(otherGroom, usageId, reason),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await dataSource.query(
      `UPDATE supply_stock_movements SET created_at = now() - interval '25 hours' WHERE usage_id = $1`,
      [usageId],
    );
    await expect(
      items.cancelUsage(groom, usageId, reason),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      items.cancelUsage(manager, usageId, reason),
    ).resolves.toMatchObject({ quantityOnHand: 50 });
  });

  it('answers 404 to an unknown usage', async () => {
    await expect(
      items.cancelUsage(manager, randomUUID(), reason),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('drops a cancelled usage from the club finance of the month it was used in', async () => {
    const repository = new FinanceReportsRepository(dataSource);
    const now = new Date();
    const period = {
      from: '',
      to: '',
      start: new Date(now.getTime() - 3_600_000),
      end: new Date(now.getTime() + 3_600_000),
    };
    await items.use(groom, itemId, { quantity: 25, note: 'Dùng' });
    await items.use(groom, itemId, { quantity: 2, note: 'Dùng' });
    const kept = 2 * 15000;
    expect(await repository.supplyValues(period)).toEqual({
      purchased: String(20 * 20000 + 30 * 15000),
      used: String(20 * 20000 + 5 * 15000 + kept),
      inventoryValue: String(23 * 15000),
    });
    const [first] = await dataSource.query<{ usage_id: string }[]>(
      `SELECT usage_id FROM supply_stock_movements
        WHERE type = 'USAGE' ORDER BY created_at LIMIT 1`,
    );

    await items.cancelUsage(manager, first.usage_id, reason);
    await dataSource.query(
      `UPDATE supply_stock_movements SET created_at = created_at + interval '40 days' WHERE type = 'USAGE_REVERSAL'`,
    );

    expect(await repository.supplyValues(period)).toEqual({
      purchased: String(20 * 20000 + 30 * 15000),
      used: String(kept),
      inventoryValue: String(20 * 20000 + 28 * 15000),
    });
  });

  it('requires a reason', async () => {
    const errors = await validate(
      plainToInstance(CancelSupplyUsageDto, { reason: '   ' }),
    );
    expect(errors.map((error) => error.property)).toEqual(['reason']);
  });
});

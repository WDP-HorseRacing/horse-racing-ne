import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { PaginationQueryDto } from '../../src/common/dto/pagination-query.dto';
import { UserRole } from '../../src/common/enums/role.enum';
import type { Actor } from '../../src/common/types/actor';
import { SupplyItemListQueryDto } from '../../src/modules/supplies/dto/supply-item.dto';
import { SupplyRequestListQueryDto } from '../../src/modules/supplies/dto/supply-request.dto';
import { SupplyItemEntity } from '../../src/modules/supplies/entities/supply-item.entity';
import { SupplyRequestEntity } from '../../src/modules/supplies/entities/supply-request.entity';
import { SupplyStockMovementEntity } from '../../src/modules/supplies/entities/supply-stock-movement.entity';
import { SupplyCategory } from '../../src/modules/supplies/enums/supply-category.enum';
import { SupplyRequestStatus } from '../../src/modules/supplies/enums/supply-request-status.enum';
import { SupplyStockMovementType } from '../../src/modules/supplies/enums/supply-stock-movement-type.enum';
import { SupplyItemsService } from '../../src/modules/supplies/items/items.service';
import { SupplyRequestsService } from '../../src/modules/supplies/requests/requests.service';
import { SupplyStockService } from '../../src/modules/supplies/shared/supply-stock.service';
import { fixtures } from './fixtures';
import {
  startTestPostgres,
  stopTestPostgres,
  truncateAllTables,
  type TestPostgres,
} from './postgres';

describe('Supplies: shared stock, stock ledger, replenishment requests (Postgres)', () => {
  let db: TestPostgres;
  let dataSource: DataSource;
  let seed: ReturnType<typeof fixtures>;
  let items: SupplyItemsService;
  let requests: SupplyRequestsService;
  let manager: Actor;
  let groom: Actor;
  let otherGroom: Actor;
  let trainer: Actor;

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

  const ledger = (itemId: string) =>
    dataSource.query<{ delta: string; balance_after: string; type: string }[]>(
      `SELECT delta, balance_after, type FROM supply_stock_movements
        WHERE item_id = $1 ORDER BY created_at, id`,
      [itemId],
    );

  const oats = (quantityOnHand?: number) =>
    items.create(manager, {
      name: 'Yến mạch',
      category: SupplyCategory.FEED,
      unit: 'kg',
      quantityOnHand,
      reorderThreshold: 50,
    });

  beforeAll(async () => {
    db = await startTestPostgres();
    dataSource = db.dataSource;
    seed = fixtures(dataSource);
    const stock = new SupplyStockService();
    items = new SupplyItemsService(
      dataSource.getRepository(SupplyItemEntity),
      dataSource.getRepository(SupplyStockMovementEntity),
      stock,
      dataSource,
    );
    requests = new SupplyRequestsService(
      dataSource.getRepository(SupplyRequestEntity),
      stock,
      dataSource,
    );
  });

  afterAll(() => stopTestPostgres(db));

  beforeEach(async () => {
    await truncateAllTables(dataSource);
    manager = await actorOf(UserRole.CLUB_MANAGER);
    groom = await actorOf(UserRole.GROOM);
    otherGroom = await actorOf(UserRole.GROOM);
    trainer = await actorOf(UserRole.HEAD_TRAINER);
  });

  describe('items and stock counts', () => {
    it('records the opening stock as a count adjustment', async () => {
      const item = await oats(40);

      expect(item.quantityOnHand).toBe('40.00');
      expect(item.lowStock).toBe(true);
      expect(item.lastCountedAt).not.toBeNull();
      expect(await ledger(item.id)).toEqual([
        { delta: '40.00', balance_after: '40.00', type: 'COUNT_ADJUST' },
      ]);
    });

    it('writes no ledger row when the item starts empty', async () => {
      const item = await oats();

      expect(item.quantityOnHand).toBe('0.00');
      expect(item.lastCountedAt).toBeNull();
      expect(await ledger(item.id)).toEqual([]);
    });

    it('rejects a duplicate name with 409', async () => {
      await oats();
      await expect(oats()).rejects.toBeInstanceOf(ConflictException);
    });

    it('records a count as the signed difference and keeps who counted', async () => {
      const item = await oats(40);

      const counted = await items.count(groom, item.id, {
        quantityOnHand: 27.5,
        note: 'Kiểm kê sáng',
      });

      expect(counted.quantityOnHand).toBe('27.50');
      expect(counted.lastCounter?.id).toBeDefined();
      const movements = await items.movementsOf(groom, item.id, page());
      expect(movements.items[0]).toMatchObject({
        delta: '-12.50',
        balanceAfter: '27.50',
        type: SupplyStockMovementType.COUNT_ADJUST,
        note: 'Kiểm kê sáng',
      });
    });

    it('still shows who counted after that account is deleted', async () => {
      const item = await oats(40);
      await items.count(groom, item.id, { quantityOnHand: 30 });
      await dataSource.query(
        'UPDATE users SET deleted_at = now() WHERE keycloak_id = $1',
        [groom.sub],
      );

      const shown = await items.get(manager, item.id);
      const listed = await items.list(
        manager,
        Object.assign(new SupplyItemListQueryDto(), { page: 1, limit: 20 }),
      );

      expect(shown.lastCounter).not.toBeNull();
      expect(listed.items[0].lastCounter?.id).toBe(shown.lastCounter?.id);
      expect((await items.lowStock(manager))[0].lastCounter).not.toBeNull();
    });

    it('does not change the stock when editing the item', async () => {
      const item = await oats(40);

      const updated = await items.update(manager, item.id, {
        reorderThreshold: 10,
      });

      expect(updated.quantityOnHand).toBe('40.00');
      expect(updated.lowStock).toBe(false);
    });

    it('lists only items at or below their threshold as low stock', async () => {
      const low = await oats(50);
      await items.create(manager, {
        name: 'Cỏ khô',
        category: SupplyCategory.FEED,
        unit: 'kg',
        quantityOnHand: 51,
        reorderThreshold: 50,
      });

      const result = await items.lowStock(groom);

      expect(result.map((row) => row.id)).toEqual([low.id]);
    });

    it('filters the list by category and name', async () => {
      await oats(10);
      await items.create(manager, {
        name: 'Vitamin E',
        category: SupplyCategory.SUPPLEMENT,
        unit: 'g',
        reorderThreshold: 0,
      });

      const query = Object.assign(new SupplyItemListQueryDto(), {
        page: 1,
        limit: 20,
        category: SupplyCategory.SUPPLEMENT,
        search: 'vita',
      });
      const result = await items.list(groom, query);

      expect(result.items.map((row) => row.name)).toEqual(['Vitamin E']);
      expect(result.meta.total).toBe(1);
    });

    it('hides a deleted item but keeps its ledger readable', async () => {
      const item = await oats(40);
      await items.remove(manager, item.id);

      await expect(items.get(groom, item.id)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      await expect(
        items.count(groom, item.id, { quantityOnHand: 1 }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect((await items.movementsOf(groom, item.id, page())).meta.total).toBe(
        1,
      );
    });
  });

  describe('replenishment requests', () => {
    it('adds the requested quantity to stock when fulfilled', async () => {
      const item = await oats(40);
      const request = await requests.create(groom, {
        itemId: item.id,
        quantity: 100,
      });

      await requests.updateStatus(manager, request.id, {
        status: SupplyRequestStatus.APPROVED,
      });
      const fulfilled = await requests.updateStatus(manager, request.id, {
        status: SupplyRequestStatus.FULFILLED,
      });

      expect(fulfilled.status).toBe(SupplyRequestStatus.FULFILLED);
      expect(fulfilled.item.quantityOnHand).toBe('140.00');
      expect(fulfilled.fulfiller).not.toBeNull();
      const movements = await items.movementsOf(manager, item.id, page());
      expect(movements.items[0]).toMatchObject({
        delta: '100.00',
        balanceAfter: '140.00',
        type: SupplyStockMovementType.RESTOCK,
        requestId: request.id,
      });
    });

    it('rejects fulfilling a request that was not approved with 409', async () => {
      const item = await oats(40);
      const request = await requests.create(groom, {
        itemId: item.id,
        quantity: 5,
      });

      await expect(
        requests.updateStatus(manager, request.id, {
          status: SupplyRequestStatus.FULFILLED,
        }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(await ledger(item.id)).toHaveLength(1);
    });

    it('requires a non-blank reason to reject', async () => {
      const item = await oats();
      const request = await requests.create(groom, {
        itemId: item.id,
        quantity: 5,
      });

      await expect(
        requests.updateStatus(manager, request.id, {
          status: SupplyRequestStatus.REJECTED,
          reason: '   ',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      const rejected = await requests.updateStatus(manager, request.id, {
        status: SupplyRequestStatus.REJECTED,
        reason: 'Kho tổng còn đủ',
      });
      expect(rejected.rejectionReason).toBe('Kho tổng còn đủ');
    });

    it('lets only the requester edit, and only while pending', async () => {
      const item = await oats();
      const request = await requests.create(groom, {
        itemId: item.id,
        quantity: 5,
      });

      await expect(
        requests.edit(otherGroom, request.id, { quantity: 7 }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      const edited = await requests.edit(groom, request.id, { quantity: 7 });
      expect(edited.quantity).toBe('7.00');

      await requests.updateStatus(manager, request.id, {
        status: SupplyRequestStatus.APPROVED,
      });
      await expect(
        requests.edit(groom, request.id, { quantity: 9 }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('scopes the list and detail to the requester, except for the Club Manager', async () => {
      const item = await oats();
      const mine = await requests.create(groom, {
        itemId: item.id,
        quantity: 1,
      });
      await requests.create(trainer, { itemId: item.id, quantity: 2 });
      const query = Object.assign(new SupplyRequestListQueryDto(), {
        page: 1,
        limit: 20,
      });

      expect(
        (await requests.list(groom, query)).items.map((row) => row.id),
      ).toEqual([mine.id]);
      expect((await requests.list(manager, query)).meta.total).toBe(2);
      await expect(requests.get(otherGroom, mine.id)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('blocks deleting an item that still has an open request', async () => {
      const item = await oats();
      const request = await requests.create(groom, {
        itemId: item.id,
        quantity: 1,
      });
      await requests.updateStatus(manager, request.id, {
        status: SupplyRequestStatus.APPROVED,
      });

      await expect(items.remove(manager, item.id)).rejects.toBeInstanceOf(
        ConflictException,
      );
      await requests.updateStatus(manager, request.id, {
        status: SupplyRequestStatus.FULFILLED,
      });
      await expect(items.remove(manager, item.id)).resolves.toBeUndefined();
    });

    it('refuses a request for a deleted item, but still shows old requests', async () => {
      const item = await oats();
      const old = await requests.create(groom, {
        itemId: item.id,
        quantity: 1,
      });
      await requests.updateStatus(manager, old.id, {
        status: SupplyRequestStatus.REJECTED,
        reason: 'Ngừng dùng',
      });
      await items.remove(manager, item.id);

      await expect(
        requests.create(groom, { itemId: item.id, quantity: 1 }),
      ).rejects.toBeInstanceOf(NotFoundException);
      const shown = await requests.get(groom, old.id);
      expect(shown.item.name).toBe('Yến mạch');
      expect(shown.item.deletedAt).not.toBeNull();
    });
  });

  it('keeps the ledger consistent when counts and restocks race', async () => {
    const item = await oats(10);
    const approved = await Promise.all(
      [1, 2, 3].map(async (quantity) => {
        const request = await requests.create(groom, {
          itemId: item.id,
          quantity,
        });
        await requests.updateStatus(manager, request.id, {
          status: SupplyRequestStatus.APPROVED,
        });
        return request.id;
      }),
    );

    await Promise.all([
      ...approved.map((id) =>
        requests.updateStatus(manager, id, {
          status: SupplyRequestStatus.FULFILLED,
        }),
      ),
      items.count(groom, item.id, { quantityOnHand: 8 }),
      items.count(trainer, item.id, { quantityOnHand: 9 }),
    ]);

    const rows = await ledger(item.id);
    let running = 0;
    for (const row of rows) {
      running += Number(row.delta);
      expect(Number(row.balance_after)).toBeCloseTo(running, 2);
    }
    const final = await items.get(manager, item.id);
    expect(Number(final.quantityOnHand)).toBeCloseTo(running, 2);
  });
});

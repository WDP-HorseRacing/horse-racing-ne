import { randomUUID } from 'node:crypto';
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
import { AuditService } from '../../src/modules/audit/services/audit.service';
import { SupplyItemListQueryDto } from '../../src/modules/supplies/dto/supply-item.dto';
import { SupplyRequestListQueryDto } from '../../src/modules/supplies/dto/supply-request.dto';
import { SupplyItemEntity } from '../../src/modules/supplies/entities/supply-item.entity';
import { SupplyLotEntity } from '../../src/modules/supplies/entities/supply-lot.entity';
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
      dataSource.getRepository(SupplyLotEntity),
      stock,
      dataSource,
      new AuditService(),
    );
    requests = new SupplyRequestsService(
      dataSource.getRepository(SupplyRequestEntity),
      stock,
      dataSource,
      new AuditService(),
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

  describe('items and lots', () => {
    it('opens the first lot from the opening stock', async () => {
      const item = await oats(40);

      expect(item.quantityOnHand).toBe(40);
      expect(item.lowStock).toBe(true);
      expect(await ledger(item.id)).toEqual([
        { delta: '40.00', balance_after: '40.00', type: 'OPENING' },
      ]);
      expect(await items.lotsOf(manager, item.id)).toEqual([
        expect.objectContaining({ quantity: 40, remaining: 40, unitPrice: 0 }),
      ]);
    });

    it('takes the opening price when one is given', async () => {
      const item = await items.create(manager, {
        name: 'Cỏ khô',
        category: SupplyCategory.FEED,
        unit: 'kg',
        quantityOnHand: 12,
        openingUnitPrice: 8000,
        reorderThreshold: 5,
      });

      const [lot] = await items.lotsOf(manager, item.id);
      expect(lot).toMatchObject({
        quantity: 12,
        remaining: 12,
        unitPrice: 8000,
      });
    });

    it('writes no ledger row and no lot when the item starts empty', async () => {
      const item = await oats();

      expect(item.quantityOnHand).toBe(0);
      expect(await ledger(item.id)).toEqual([]);
      expect(await items.lotsOf(manager, item.id)).toEqual([]);
    });

    it('rejects a duplicate name with 409', async () => {
      await oats();
      await expect(oats()).rejects.toBeInstanceOf(ConflictException);
    });

    it('does not change the stock when editing the item', async () => {
      const item = await oats(40);

      const updated = await items.update(manager, item.id, {
        reorderThreshold: 10,
      });

      expect(updated.quantityOnHand).toBe(40);
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

    it('treats %, _ and \\ in the name search as plain characters', async () => {
      for (const name of ['Muối_khoáng', 'MuốiXkhoáng', 'Đạm 20%']) {
        await items.create(manager, {
          name,
          category: SupplyCategory.SUPPLEMENT,
          unit: 'kg',
          reorderThreshold: 0,
        });
      }
      const search = async (text: string) =>
        (
          await items.list(
            groom,
            Object.assign(new SupplyItemListQueryDto(), {
              page: 1,
              limit: 20,
              search: text,
            }),
          )
        ).items.map((row) => row.name);

      await expect(search('i_k')).resolves.toEqual(['Muối_khoáng']);
      await expect(search('%')).resolves.toEqual(['Đạm 20%']);
    });

    it('hides a deleted item but keeps its ledger readable', async () => {
      const item = await oats(40);
      await items.remove(manager, item.id);

      await expect(items.get(groom, item.id)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      await expect(
        items.use(groom, item.id, { quantity: 1 }),
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
        unitPrice: 20000,
      });

      expect(fulfilled.status).toBe(SupplyRequestStatus.FULFILLED);
      expect(fulfilled.item.quantityOnHand).toBe(140);
      expect(fulfilled.fulfiller).not.toBeNull();
      const movements = await items.movementsOf(manager, item.id, page());
      expect(movements.items[0]).toMatchObject({
        delta: 100,
        balanceAfter: 140,
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
          unitPrice: 20000,
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
      expect(edited.quantity).toBe(7);

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
        unitPrice: 20000,
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

  it('keeps the ledger and the lots consistent when usages and restocks race', async () => {
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
          unitPrice: 20000,
        }),
      ),
      items.use(groom, item.id, { quantity: 2 }),
      items.use(trainer, item.id, { quantity: 3 }),
    ]);

    const rows = await ledger(item.id);
    let running = 0;
    for (const row of rows) {
      running += Number(row.delta);
      expect(Number(row.balance_after)).toBeCloseTo(running, 2);
    }
    const final = await items.get(manager, item.id);
    expect(Number(final.quantityOnHand)).toBeCloseTo(running, 2);
    const remaining = (await items.lotsOf(manager, item.id)).reduce(
      (sum, lot) => sum + lot.remaining,
      0,
    );
    expect(remaining).toBeCloseTo(final.quantityOnHand, 2);
    expect(final.quantityOnHand).toBe(11);
  });

  describe('audit trail', () => {
    const idOf = async (actor: Actor) =>
      (
        await dataSource.query<{ id: string }[]>(
          'SELECT id FROM users WHERE keycloak_id = $1',
          [actor.sub],
        )
      )[0].id;

    const auditsOf = (entityId: string) =>
      dataSource.query<
        {
          actor_id: string | null;
          action: string;
          entity_type: string;
          before_data: Record<string, unknown> | null;
          after_data: Record<string, unknown> | null;
          reason: string | null;
          feature: string | null;
        }[]
      >(
        `SELECT actor_id, action, entity_type, before_data, after_data, reason, feature
           FROM audit_logs WHERE entity_id = $1 ORDER BY created_at, id`,
        [entityId],
      );

    it('logs creating, editing, using and deleting an item', async () => {
      const managerId = await idOf(manager);
      const groomId = await idOf(groom);
      const item = await oats(40);
      await items.update(manager, item.id, { reorderThreshold: 60 });
      await items.update(manager, item.id, { unit: 'kg' });
      await items.use(groom, item.id, { quantity: 5, note: 'Bữa sáng' });
      const [lot] = await items.lotsOf(manager, item.id);
      await items.remove(manager, item.id);

      await expect(auditsOf(item.id)).resolves.toEqual([
        {
          actor_id: managerId,
          action: 'CREATE',
          entity_type: 'SUPPLY_ITEM',
          before_data: null,
          after_data: {
            name: 'Yến mạch',
            category: SupplyCategory.FEED,
            unit: 'kg',
            quantityOnHand: 40,
            openingUnitPrice: 0,
            reorderThreshold: 50,
          },
          reason: null,
          feature: 'SUPPLY_ITEM',
        },
        {
          actor_id: managerId,
          action: 'UPDATE',
          entity_type: 'SUPPLY_ITEM',
          before_data: { reorderThreshold: 50 },
          after_data: { reorderThreshold: 60 },
          reason: null,
          feature: 'SUPPLY_ITEM',
        },
        {
          actor_id: groomId,
          action: 'UPDATE',
          entity_type: 'SUPPLY_ITEM',
          before_data: { quantityOnHand: 40 },
          after_data: {
            quantityOnHand: 35,
            used: 5,
            lots: [{ lotId: lot.id, quantity: 5, unitPrice: 0 }],
          },
          reason: 'Bữa sáng',
          feature: 'SUPPLY_STOCK',
        },
        {
          actor_id: managerId,
          action: 'DELETE',
          entity_type: 'SUPPLY_ITEM',
          before_data: {
            name: 'Yến mạch',
            category: SupplyCategory.FEED,
            unit: 'kg',
          },
          after_data: null,
          reason: null,
          feature: 'SUPPLY_ITEM',
        },
      ]);
    });

    it('logs a request from creation to fulfilment', async () => {
      const managerId = await idOf(manager);
      const groomId = await idOf(groom);
      const item = await oats(40);
      const request = await requests.create(groom, {
        itemId: item.id,
        quantity: 5,
        note: 'Sắp hết',
      });
      await requests.edit(groom, request.id, { quantity: 7 });
      await requests.edit(groom, request.id, { quantity: 7 });
      await requests.updateStatus(manager, request.id, {
        status: SupplyRequestStatus.APPROVED,
      });
      await requests.updateStatus(manager, request.id, {
        status: SupplyRequestStatus.FULFILLED,
        unitPrice: 20000,
      });

      const rows = await auditsOf(request.id);
      expect(
        rows.map((row) => [
          row.actor_id,
          row.action,
          row.before_data,
          row.after_data,
        ]),
      ).toEqual([
        [
          groomId,
          'CREATE',
          null,
          {
            itemId: item.id,
            quantity: 5,
            note: 'Sắp hết',
            status: SupplyRequestStatus.PENDING,
          },
        ],
        [groomId, 'UPDATE', { quantity: 5 }, { quantity: 7 }],
        [
          managerId,
          'UPDATE',
          { status: SupplyRequestStatus.PENDING },
          { status: SupplyRequestStatus.APPROVED },
        ],
        [
          managerId,
          'UPDATE',
          { status: SupplyRequestStatus.APPROVED },
          {
            status: SupplyRequestStatus.FULFILLED,
            quantity: 7,
            unitPrice: 20000,
          },
        ],
      ]);
      expect(
        rows.every(
          (row) =>
            row.entity_type === 'SUPPLY_REQUEST' &&
            row.feature === 'SUPPLY_REQUEST',
        ),
      ).toBe(true);
    });

    it('keeps the rejection reason on the audit row', async () => {
      const item = await oats();
      const request = await requests.create(groom, {
        itemId: item.id,
        quantity: 5,
      });

      await requests.updateStatus(manager, request.id, {
        status: SupplyRequestStatus.REJECTED,
        reason: 'Kho tổng còn đủ',
      });

      const rows = await auditsOf(request.id);
      expect(rows[1]).toMatchObject({
        before_data: { status: SupplyRequestStatus.PENDING },
        after_data: { status: SupplyRequestStatus.REJECTED },
        reason: 'Kho tổng còn đủ',
      });
    });
  });

  describe('unit price', () => {
    it('keeps the price paid on each lot', async () => {
      const item = await oats(10);
      const fulfil = async (quantity: number, unitPrice: number) => {
        const request = await requests.create(groom, {
          itemId: item.id,
          quantity,
        });
        await requests.updateStatus(manager, request.id, {
          status: SupplyRequestStatus.APPROVED,
        });
        await requests.updateStatus(manager, request.id, {
          status: SupplyRequestStatus.FULFILLED,
          unitPrice,
        });
      };

      await fulfil(100, 20000);
      await items.receive(manager, item.id, { quantity: 50, unitPrice: 25000 });

      const movements = await items.movementsOf(manager, item.id, page());
      expect(
        movements.items.map((row) => [row.type, row.delta, row.unitPrice]),
      ).toEqual([
        [SupplyStockMovementType.RESTOCK, 50, 25000],
        [SupplyStockMovementType.RESTOCK, 100, 20000],
        [SupplyStockMovementType.OPENING, 10, 0],
      ]);
      expect(
        (await items.lotsOf(manager, item.id)).map((lot) => [
          lot.quantity,
          lot.unitPrice,
        ]),
      ).toEqual([
        [10, 0],
        [100, 20000],
        [50, 25000],
      ]);
    });

    it('refuses to fulfil a request without the price paid', async () => {
      const item = await oats();
      const request = await requests.create(groom, {
        itemId: item.id,
        quantity: 5,
      });
      await requests.updateStatus(manager, request.id, {
        status: SupplyRequestStatus.APPROVED,
      });

      await expect(
        requests.updateStatus(manager, request.id, {
          status: SupplyRequestStatus.FULFILLED,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect((await items.get(manager, item.id)).quantityOnHand).toBe(0);
    });
  });

  describe('receipts and usages', () => {
    it('adds a direct receipt with the price of the moment and logs it', async () => {
      const item = await items.create(manager, {
        name: 'Cám',
        category: SupplyCategory.FEED,
        unit: 'kg',
        reorderThreshold: 5,
      });

      const received = await items.receive(manager, item.id, {
        quantity: 80,
        unitPrice: 12000,
        note: 'Mua đợt 1',
      });

      expect(received.quantityOnHand).toBe(80);
      const [line] = (await items.movementsOf(manager, item.id, page())).items;
      expect(line).toMatchObject({
        type: SupplyStockMovementType.RESTOCK,
        delta: 80,
        balanceAfter: 80,
        unitPrice: 12000,
        amount: 960000,
        requestId: null,
        note: 'Mua đợt 1',
      });
      const [audit] = await dataSource.query<
        Array<{ before_data: unknown; after_data: unknown; reason: string }>
      >(
        `SELECT before_data, after_data, reason FROM audit_logs
          WHERE entity_id = $1 AND feature = 'SUPPLY_STOCK'`,
        [item.id],
      );
      expect(audit).toEqual({
        before_data: { quantityOnHand: 0 },
        after_data: {
          quantityOnHand: 80,
          received: 80,
          unitPrice: 12000,
          lotId: line.lotId,
        },
        reason: 'Mua đợt 1',
      });
    });

    it('takes stock out at once and refuses more than what is left', async () => {
      const item = await oats(40);

      const used = await items.use(groom, item.id, {
        quantity: 2.5,
        note: 'Bữa sáng',
      });

      expect(used.quantityOnHand).toBe(37.5);
      const [line] = (await items.movementsOf(manager, item.id, page())).items;
      expect(line).toMatchObject({
        type: SupplyStockMovementType.USAGE,
        delta: -2.5,
        balanceAfter: 37.5,
        unitPrice: 0,
        amount: 0,
        note: 'Bữa sáng',
      });
      await expect(
        items.use(groom, item.id, { quantity: 38 }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect((await items.get(manager, item.id)).quantityOnHand).toBe(37.5);
    });

    it('takes from the oldest lot first and splits across lots', async () => {
      const item = await items.create(manager, {
        name: 'Băng gạc',
        category: SupplyCategory.EQUIPMENT,
        unit: 'cuộn',
        reorderThreshold: 5,
      });
      await items.receive(manager, item.id, { quantity: 20, unitPrice: 20000 });
      await items.receive(manager, item.id, { quantity: 30, unitPrice: 15000 });

      await items.use(groom, item.id, { quantity: 25 });

      expect(
        (await items.lotsOf(manager, item.id)).map((lot) => [
          lot.unitPrice,
          lot.remaining,
        ]),
      ).toEqual([
        [20000, 0],
        [15000, 25],
      ]);
      const usages = (await items.movementsOf(manager, item.id, page())).items
        .filter((row) => row.type === SupplyStockMovementType.USAGE)
        .map((row) => [row.delta, row.unitPrice, row.amount, row.balanceAfter]);
      expect(usages).toEqual([
        [-5, 15000, -75000, 25],
        [-20, 20000, -400000, 30],
      ]);
    });

    it('answers 404 to a receipt or a lot list for a missing item, and to a receipt for a deleted one', async () => {
      const item = await oats(5);
      await items.remove(manager, item.id);

      await expect(
        items.receive(manager, item.id, { quantity: 1, unitPrice: 1000 }),
      ).rejects.toBeInstanceOf(NotFoundException);
      await expect(
        items.receive(manager, randomUUID(), { quantity: 1, unitPrice: 1000 }),
      ).rejects.toBeInstanceOf(NotFoundException);
      await expect(items.lotsOf(manager, randomUUID())).rejects.toBeInstanceOf(
        NotFoundException,
      );
      await expect(items.lotsOf(manager, item.id)).resolves.toHaveLength(1);
    });
  });
});

import { ConflictException, ForbiddenException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { UserRole } from '../../../src/common/enums/role.enum';
import { DomainEventPublisher } from '../../../src/common/infrastructure/events/domain-event.publisher';
import type { Actor } from '../../../src/common/types/actor';
import { clubToday, shiftDays } from '../../../src/common/utils/club-date';
import { AuditService } from '../../../src/modules/audit/services/audit.service';
import { DailyFeesService } from '../../../src/modules/billing/daily-fees/daily-fees.service';
import { DailyFeeEntity } from '../../../src/modules/billing/entities/daily-fee.entity';
import { HorseLifecycleStatus } from '../../../src/modules/horses/enums/horse-status.enum';
import { HorseAccessService } from '../../../src/modules/horses/shared/horse-access.service';
import type { MediaService } from '../../../src/modules/media/services/media.service';
import { MedicalExamRequestEntity } from '../../../src/modules/medical/entities/medical-exam-request.entity';
import { ExamRequestsService } from '../../../src/modules/medical/exam-requests/exam-requests.service';
import type { MedicalAccessService } from '../../../src/modules/medical/shared/medical-access.service';
import { CareTasksService } from '../../../src/modules/stable/care-tasks/care-tasks.service';
import { FeedingMeal } from '../../../src/modules/stable/constants/feeding-meal.enum';
import { SchedulerRegistry } from '@nestjs/schedule';
import { ChecklistGenerationService } from '../../../src/modules/stable/daily-checklists/checklist-generation.service';
import { ChecklistsService } from '../../../src/modules/stable/daily-checklists/checklists.service';
import { CareTaskTypeEntity } from '../../../src/modules/stable/entities/care-task-type.entity';
import { DailyChecklistEntity } from '../../../src/modules/stable/entities/daily-checklist.entity';
import { FeedingPlanEntity } from '../../../src/modules/stable/entities/feeding-plan.entity';
import { HorseCareTaskEntity } from '../../../src/modules/stable/entities/horse-care-task.entity';
import { IncidentEntity } from '../../../src/modules/stable/entities/incident.entity';
import { FeedingPlansService } from '../../../src/modules/stable/feeding-plans/feeding-plans.service';
import { IncidentsService } from '../../../src/modules/stable/incidents/incidents.service';
import { DailyChecklistsService } from '../../../src/modules/stable/shared/daily-checklists.service';
import { StableAccessService } from '../../../src/modules/stable/shared/stable-access.service';
import { SUPPLY_LOW_STOCK_EVENT } from '../../../src/modules/supplies/constants/supply-events.constants';
import { SupplyItemEntity } from '../../../src/modules/supplies/entities/supply-item.entity';
import { SupplyLotEntity } from '../../../src/modules/supplies/entities/supply-lot.entity';
import { SupplyRequestEntity } from '../../../src/modules/supplies/entities/supply-request.entity';
import { SupplyStockMovementEntity } from '../../../src/modules/supplies/entities/supply-stock-movement.entity';
import { SupplyCategory } from '../../../src/modules/supplies/enums/supply-category.enum';
import { SupplyRequestStatus } from '../../../src/modules/supplies/enums/supply-request-status.enum';
import { SupplyItemsService } from '../../../src/modules/supplies/items/items.service';
import { SupplyRequestsService } from '../../../src/modules/supplies/requests/requests.service';
import { SupplyStockService } from '../../../src/modules/supplies/shared/supply-stock.service';
import { fixtures } from '../fixtures';
import {
  startTestPostgres,
  stopTestPostgres,
  truncateAllTables,
  type TestPostgres,
} from '../postgres';

describe('Findings: stable, supplies, daily fees (Postgres)', () => {
  let db: TestPostgres;
  let dataSource: DataSource;
  let seed: ReturnType<typeof fixtures>;
  let items: SupplyItemsService;
  let requests: SupplyRequestsService;
  let plans: FeedingPlansService;
  let incidents: IncidentsService;
  let checklists: ChecklistsService;
  let generation: ChecklistGenerationService;
  let careTasks: CareTasksService;
  let fees: DailyFeesService;
  let manager: Actor;
  let trainer: Actor;
  let groom: Actor;
  let otherGroom: Actor;
  let groomId: string;
  let gio: string;

  const actorOf = async (id: string, role: UserRole): Promise<Actor> => {
    const [row] = await dataSource.query<{ keycloak_id: string }[]>(
      'SELECT keycloak_id FROM users WHERE id = $1',
      [id],
    );
    return { sub: row.keycloak_id, roles: [role] };
  };

  const oats = (quantityOnHand?: number, reorderThreshold = 50) =>
    items.create(manager, {
      name: 'Yến mạch',
      category: SupplyCategory.FEED,
      unit: 'kg',
      quantityOnHand,
      reorderThreshold,
    });

  const approvedRequest = async (itemId: string, quantity: number) => {
    const request = await requests.create(groom, { itemId, quantity });
    await requests.updateStatus(manager, request.id, {
      status: SupplyRequestStatus.APPROVED,
    });
    return request.id;
  };

  beforeAll(async () => {
    db = await startTestPostgres();
    dataSource = db.dataSource;
    seed = fixtures(dataSource);
    const stock = new SupplyStockService();
    const events = new DomainEventPublisher();
    const horseAccess = new HorseAccessService(dataSource);
    const access = new StableAccessService(horseAccess);
    items = new SupplyItemsService(
      dataSource.getRepository(SupplyItemEntity),
      dataSource.getRepository(SupplyStockMovementEntity),
      dataSource.getRepository(SupplyLotEntity),
      stock,
      dataSource,
      new AuditService(),
      events,
    );
    requests = new SupplyRequestsService(
      dataSource.getRepository(SupplyRequestEntity),
      stock,
      dataSource,
      new AuditService(),
      events,
    );
    plans = new FeedingPlansService(
      dataSource.getRepository(FeedingPlanEntity),
      access,
      dataSource,
      new AuditService(),
    );
    const media = {
      assertAttachableIncidentPhoto: jest.fn().mockResolvedValue(undefined),
      signDownloadUrls: jest.fn(() => Promise.resolve(new Map())),
    };
    incidents = new IncidentsService(
      dataSource.getRepository(IncidentEntity),
      access,
      horseAccess,
      media as unknown as MediaService,
      new ExamRequestsService(
        dataSource,
        dataSource.getRepository(MedicalExamRequestEntity),
        {} as MedicalAccessService,
        horseAccess,
        new AuditService(),
        events,
      ),
      events,
      dataSource,
      new AuditService(),
    );
    const daily = new DailyChecklistsService(events);
    checklists = new ChecklistsService(
      dataSource.getRepository(DailyChecklistEntity),
      access,
      daily,
      dataSource,
      new AuditService(),
    );
    generation = new ChecklistGenerationService(
      checklists,
      dataSource,
      events,
      new AuditService(),
      new SchedulerRegistry(),
    );
    careTasks = new CareTasksService(
      dataSource.getRepository(CareTaskTypeEntity),
      dataSource.getRepository(HorseCareTaskEntity),
      access,
      daily,
      dataSource,
      new AuditService(),
    );
    fees = new DailyFeesService(
      dataSource.getRepository(DailyFeeEntity),
      dataSource,
      new AuditService(),
    );
  });

  afterAll(() => stopTestPostgres(db));

  beforeEach(async () => {
    await truncateAllTables(dataSource);
    manager = await actorOf(
      await seed.user(UserRole.CLUB_MANAGER),
      UserRole.CLUB_MANAGER,
    );
    const trainerId = await seed.user(UserRole.HEAD_TRAINER);
    trainer = await actorOf(trainerId, UserRole.HEAD_TRAINER);
    groomId = await seed.user(UserRole.GROOM);
    groom = await actorOf(groomId, UserRole.GROOM);
    otherGroom = await actorOf(await seed.user(UserRole.GROOM), UserRole.GROOM);
    const barn = await seed.barn('Khu A');
    await dataSource.query(
      'UPDATE barns SET head_trainer_id = $1 WHERE id = $2',
      [trainerId, barn],
    );
    gio = await seed.horse('Gió', { barnId: barn });
    await dataSource.query(
      `INSERT INTO groom_assignments (version, horse_id, groom_id, start_at)
       VALUES (1, $1, $2, now())`,
      [gio, groomId],
    );
  });

  describe('supply requests', () => {
    it('B6a: Club Manager can cancel an APPROVED request', async () => {
      const item = await oats(10);
      const id = await approvedRequest(item.id, 50);

      await expect(
        requests.updateStatus(manager, id, {
          status: 'CANCELLED' as SupplyRequestStatus,
          reason: 'Nhà cung cấp hết hàng',
        }),
      ).resolves.toMatchObject({ status: 'CANCELLED' });
    });

    it('B6b: fulfilling restocks the quantity actually received, not the requested one', async () => {
      const item = await oats(10);
      const id = await approvedRequest(item.id, 50);

      const fulfilled = await requests.updateStatus(manager, id, {
        status: SupplyRequestStatus.FULFILLED,
        unitPrice: 20000,
        receivedQuantity: 40,
      } as never);

      expect(fulfilled.item.quantityOnHand).toBe(50);
    });

    it('F4-13: approving a request edited after the manager viewed it is rejected as stale', async () => {
      const item = await oats(10);
      const request = await requests.create(groom, {
        itemId: item.id,
        quantity: 10,
      });
      const viewed = await requests.get(manager, request.id);
      await requests.edit(groom, request.id, { quantity: 100 });

      await expect(
        requests.updateStatus(manager, request.id, {
          status: SupplyRequestStatus.APPROVED,
          quantity: viewed.quantity,
        } as never),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('supply items', () => {
    it('B15a: changing the unit of an item that has stock is rejected with 409', async () => {
      const item = await oats(500);

      await expect(
        items.update(manager, item.id, { unit: 'bao' }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('B15b: deleting an item with stock on hand is rejected with 409', async () => {
      const item = await oats(30);

      await expect(items.remove(manager, item.id)).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('B15b: deleting an item used by an ACTIVE feeding plan is rejected with 409', async () => {
      const item = await oats();
      const [draft] = await plans.create(trainer, {
        horseIds: [gio],
        items: [
          {
            meal: FeedingMeal.EARLY_MORNING,
            supplyItemId: item.id,
            quantity: 2,
          },
        ],
      });
      await plans.approve(trainer, draft.id);

      await expect(items.remove(manager, item.id)).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('F4-14: item names are unique regardless of case', async () => {
      await items.create(manager, {
        name: 'Cám A',
        category: SupplyCategory.FEED,
        unit: 'kg',
        reorderThreshold: 0,
      });

      await expect(
        items.create(manager, {
          name: 'cám a',
          category: SupplyCategory.FEED,
          unit: 'kg',
          reorderThreshold: 0,
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('F4-11: restocking past the numeric(12,2) limit fails with a 409 domain error', async () => {
      const item = await oats();
      let failure: unknown;
      for (let i = 0; i < 10 && !failure; i++) {
        failure = await items
          .receive(manager, item.id, { quantity: 1e9, unitPrice: 1 })
          .then(
            () => undefined,
            (error: unknown) => error,
          );
      }

      expect(String(failure)).toBe(String(new ConflictException()));
      expect(failure).toBeInstanceOf(ConflictException);
    });

    it('B19: raising the threshold above current stock emits a low-stock event', async () => {
      const item = await oats(120, 50);

      await items.update(manager, item.id, { reorderThreshold: 200 });

      const rows = await dataSource.query<unknown[]>(
        'SELECT id FROM outbox_events WHERE event_name = $1',
        [SUPPLY_LOW_STOCK_EVENT],
      );
      expect(rows).toHaveLength(1);
    });
  });

  describe('incidents', () => {
    it('N3 (rule check): a groom not assigned to the horse gets 403', async () => {
      await expect(
        incidents.report(otherGroom, { horseId: gio, description: 'x' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('F4-19: the former groom of a DECEASED horse gets 409, not 403', async () => {
      await dataSource.query(
        'UPDATE horses SET lifecycle_status = $1 WHERE id = $2',
        [HorseLifecycleStatus.DECEASED, gio],
      );
      await dataSource.query(
        'UPDATE groom_assignments SET end_at = now() WHERE horse_id = $1',
        [gio],
      );

      await expect(
        incidents.report(groom, { horseId: gio, description: 'x' }),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('daily fees', () => {
    it('F4-2: a fee that takes effect today can still be deleted the same day', async () => {
      const current = await fees.create(manager, {
        effectiveFrom: clubToday(),
        dailyFee: 2500000,
      });

      await expect(fees.remove(manager, current.id)).resolves.toBeUndefined();
    });
  });

  describe('daily checklists', () => {
    afterEach(() => jest.useRealTimers());

    const fakeNow = (iso: string) =>
      jest.useFakeTimers({
        now: new Date(iso),
        doNotFake: [
          'nextTick',
          'setImmediate',
          'clearImmediate',
          'setInterval',
          'clearInterval',
          'setTimeout',
          'clearTimeout',
          'queueMicrotask',
          'hrtime',
          'performance',
        ],
      });

    it('F4-7: ticking yesterday’s item right after midnight is accepted', async () => {
      await careTasks.createType(manager, {
        name: 'Cho ăn',
        appliesToAll: true,
      });
      const today = clubToday();
      fakeNow(`${today}T23:30:00+07:00`);
      await generation.runDaily();
      const [checklist] = await checklists.listForHorse(groom, gio, {});
      expect(checklist.checklistDate).toBe(today);

      fakeNow(`${shiftDays(today, 1)}T00:02:00+07:00`);

      await expect(
        checklists.tick(groom, checklist.items[0].id, { done: true }),
      ).resolves.toBeDefined();
    });
  });
});

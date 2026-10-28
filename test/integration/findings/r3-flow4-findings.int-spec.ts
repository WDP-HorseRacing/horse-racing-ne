import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DataSource } from 'typeorm';
import { ACCESS_KEY } from '../../../src/common/constants/auth.constants';
import { UserRole } from '../../../src/common/enums/role.enum';
import { DomainEventPublisher } from '../../../src/common/infrastructure/events/domain-event.publisher';
import type { Actor } from '../../../src/common/types/actor';
import { clubToday, shiftDays } from '../../../src/common/utils/club-date';
import { AuditService } from '../../../src/modules/audit/services/audit.service';
import { BillingModule } from '../../../src/modules/billing/billing.module';
import { DailyFeesService } from '../../../src/modules/billing/daily-fees/daily-fees.service';
import { DailyFeeEntity } from '../../../src/modules/billing/entities/daily-fee.entity';
import { HorseAccessService } from '../../../src/modules/horses/shared/horse-access.service';
import type { MediaService } from '../../../src/modules/media/services/media.service';
import { ExamRequestStatus } from '../../../src/modules/medical/constants/exam-request.enum';
import { MedicalExamRequestEntity } from '../../../src/modules/medical/entities/medical-exam-request.entity';
import { ExamRequestsService } from '../../../src/modules/medical/exam-requests/exam-requests.service';
import type { MedicalAccessService } from '../../../src/modules/medical/shared/medical-access.service';
import { FinanceReportsRepository } from '../../../src/modules/reports/finance-reports/finance-reports.repository';
import { FinanceReportsService } from '../../../src/modules/reports/finance-reports/finance-reports.service';
import { ReportsModule } from '../../../src/modules/reports/reports.module';
import { CareTasksService } from '../../../src/modules/stable/care-tasks/care-tasks.service';
import { IncidentListQueryDto } from '../../../src/modules/stable/dto/incident.dto';
import { FeedingMeal } from '../../../src/modules/stable/constants/feeding-meal.enum';
import { SchedulerRegistry } from '@nestjs/schedule';
import {
  ChecklistJob,
  checklistRetryName,
} from '../../../src/modules/stable/constants/checklist-job.enum';
import { ChecklistGenerationService } from '../../../src/modules/stable/daily-checklists/checklist-generation.service';
import { ChecklistsService } from '../../../src/modules/stable/daily-checklists/checklists.service';
import { CareTaskTypeEntity } from '../../../src/modules/stable/entities/care-task-type.entity';
import { DailyChecklistEntity } from '../../../src/modules/stable/entities/daily-checklist.entity';
import { FeedingPlanEntity } from '../../../src/modules/stable/entities/feeding-plan.entity';
import { HorseCareTaskEntity } from '../../../src/modules/stable/entities/horse-care-task.entity';
import { IncidentEntity } from '../../../src/modules/stable/entities/incident.entity';
import { FeedingPlansController } from '../../../src/modules/stable/feeding-plans/feeding-plans.controller';
import { FeedingPlansService } from '../../../src/modules/stable/feeding-plans/feeding-plans.service';
import { IncidentRemindersService } from '../../../src/modules/stable/incidents/incident-reminders.service';
import { IncidentsService } from '../../../src/modules/stable/incidents/incidents.service';
import { DailyChecklistsService } from '../../../src/modules/stable/shared/daily-checklists.service';
import { StableAccessService } from '../../../src/modules/stable/shared/stable-access.service';
import { SupplyItemEntity } from '../../../src/modules/supplies/entities/supply-item.entity';
import { SupplyLotEntity } from '../../../src/modules/supplies/entities/supply-lot.entity';
import { SupplyStockMovementEntity } from '../../../src/modules/supplies/entities/supply-stock-movement.entity';
import { SupplyCategory } from '../../../src/modules/supplies/enums/supply-category.enum';
import { SupplyItemsController } from '../../../src/modules/supplies/items/items.controller';
import { SupplyItemsService } from '../../../src/modules/supplies/items/items.service';
import { SupplyRequestsController } from '../../../src/modules/supplies/requests/requests.controller';
import { SuppliesModule } from '../../../src/modules/supplies/supplies.module';
import { SupplyStockService } from '../../../src/modules/supplies/shared/supply-stock.service';
import { fixtures } from '../fixtures';
import {
  startTestPostgres,
  stopTestPostgres,
  truncateAllTables,
  type TestPostgres,
} from '../postgres';

type Ctor = { prototype: Record<string, unknown> };

/**
 * Cron expressions declared by the providers of a module and of the modules it imports directly
 */
function cronsOf(root: unknown): string[] {
  const out: string[] = [];
  const providersOf = (m: unknown): unknown[] =>
    typeof m === 'function'
      ? ((Reflect.getMetadata('providers', m) as unknown[]) ?? [])
      : [];
  const importsOf = (m: unknown): unknown[] =>
    typeof m === 'function'
      ? ((Reflect.getMetadata('imports', m) as unknown[]) ?? [])
      : [];
  for (const mod of [root, ...importsOf(root)]) {
    for (const p of providersOf(mod)) {
      if (typeof p !== 'function') continue;
      const proto = (p as Ctor).prototype;
      for (const key of Object.getOwnPropertyNames(proto)) {
        const fn = proto[key];
        if (typeof fn !== 'function') continue;
        const meta = Reflect.getMetadata('SCHEDULE_CRON_OPTIONS', fn) as
          { cronTime: unknown } | undefined;
        if (meta) out.push(String(meta.cronTime));
      }
    }
  }
  return out;
}

/**
 * Route paths declared on a controller's methods
 */
function routesOf(controller: Ctor): string[] {
  return Object.getOwnPropertyNames(controller.prototype).flatMap((key) => {
    const fn = controller.prototype[key];
    if (typeof fn !== 'function' || key === 'constructor') return [];
    const path = Reflect.getMetadata('path', fn) as string | undefined;
    return path ? [path] : [];
  });
}

const DOCS = join(__dirname, '../../../docs');
const docsText = () =>
  readdirSync(DOCS)
    .filter((f) => f.endsWith('.md'))
    .map((f) => readFileSync(join(DOCS, f), 'utf8'))
    .join('\n');

describe('Findings R3: Flow 4 stable, supplies, fees, reports, media (Postgres)', () => {
  let db: TestPostgres;
  let dataSource: DataSource;
  let seed: ReturnType<typeof fixtures>;
  let items: SupplyItemsService;
  let plans: FeedingPlansService;
  let incidents: IncidentsService;
  let reminders: IncidentRemindersService;
  let checklists: ChecklistsService;
  let careTasks: CareTasksService;
  let fees: DailyFeesService;
  let finance: FinanceReportsService;
  let manager: Actor;
  let trainer: Actor;
  let groom: Actor;
  let vet: Actor;
  let groomId: string;
  let otherGroomId: string;
  let vetId: string;
  let gio: string;

  const actorOf = async (id: string, role: UserRole): Promise<Actor> => {
    const [row] = await dataSource.query<{ keycloak_id: string }[]>(
      'SELECT keycloak_id FROM users WHERE id = $1',
      [id],
    );
    return { sub: row.keycloak_id, roles: [role] };
  };

  const item = (category: SupplyCategory, quantityOnHand = 100) =>
    items.create(manager, {
      name: `Vật tư ${category}`,
      category,
      unit: 'kg',
      quantityOnHand,
      reorderThreshold: 0,
    });

  const privateType = (name = 'Ngâm đá') =>
    careTasks.createType(manager, { name, appliesToAll: false });

  const todayItemsOfType = async (taskTypeId: string) =>
    dataSource.query<unknown[]>(
      `SELECT i.id FROM daily_checklist_items i
         JOIN daily_checklists c ON c.id = i.checklist_id
        WHERE c.horse_id = $1 AND c.checklist_date = $2 AND i.task_type_id = $3
          AND i.done_at IS NULL`,
      [gio, clubToday(), taskTypeId],
    );

  const eventsMentioning = (text: string) =>
    dataSource.query<{ event_name: string }[]>(
      `SELECT event_name FROM outbox_events WHERE payload::text LIKE $1`,
      [`%${text}%`],
    );

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
    reminders = new IncidentRemindersService(events, dataSource);
    const daily = new DailyChecklistsService(events);
    checklists = new ChecklistsService(
      dataSource.getRepository(DailyChecklistEntity),
      access,
      daily,
      dataSource,
      new AuditService(),
    );
    careTasks = new CareTasksService(
      dataSource.getRepository(CareTaskTypeEntity),
      dataSource.getRepository(HorseCareTaskEntity),
      access,
      daily,
      dataSource,
      new AuditService(),
      new DomainEventPublisher(),
    );
    fees = new DailyFeesService(
      dataSource.getRepository(DailyFeeEntity),
      dataSource,
      new AuditService(),
    );
    finance = new FinanceReportsService(
      new FinanceReportsRepository(dataSource),
      dataSource,
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
    otherGroomId = await seed.user(UserRole.GROOM);
    vetId = await seed.user(UserRole.VETERINARIAN);
    vet = await actorOf(vetId, UserRole.VETERINARIAN);
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

  describe('daily checklists and care tasks', () => {
    it('B16: a failed checklist generation at 00:05 is retried later the same day', async () => {
      const scheduler = new SchedulerRegistry();
      const generation = new ChecklistGenerationService(
        checklists,
        dataSource,
        new DomainEventPublisher(),
        new AuditService(),
        scheduler,
      );
      jest
        .spyOn(checklists, 'generateDay')
        .mockRejectedValueOnce(new Error('DB chập chờn'));

      try {
        await generation.runDaily();

        expect(scheduler.getTimeouts()).toContain(
          checklistRetryName(ChecklistJob.GENERATE_TODAY),
        );
      } finally {
        for (const name of scheduler.getTimeouts()) {
          scheduler.deleteTimeout(name);
        }
        jest.restoreAllMocks();
      }
    });

    it('N2: an ACTIVE ration with two meals yields one feeding line per meal', async () => {
      await careTasks.createType(manager, {
        name: 'Cho ăn',
        appliesToAll: true,
      });
      const oats = await item(SupplyCategory.FEED);
      const [draft] = await plans.create(trainer, {
        horseIds: [gio],
        items: [
          {
            meal: FeedingMeal.EARLY_MORNING,
            supplyItemId: oats.id,
            quantity: 2,
          },
          { meal: FeedingMeal.EVENING, supplyItemId: oats.id, quantity: 2 },
        ],
      });
      await plans.approve(trainer, draft.id);

      await checklists.generateDay(clubToday());
      const [checklist] = await checklists.listForHorse(groom, gio, {});

      expect(checklist.items.length).toBeGreaterThanOrEqual(2);
    });

    it('N9a: a groom sees open incidents of the horse he now cares for, reported by the previous groom', async () => {
      await dataSource.query(
        `INSERT INTO groom_assignments (version, horse_id, groom_id, start_at, end_at)
         VALUES (1, $1, $2, now() - interval '2 days', now() - interval '1 day')`,
        [gio, otherGroomId],
      );
      await dataSource.query(
        `INSERT INTO incidents (id, version, horse_id, reported_by, description, status, created_at)
         VALUES (gen_random_uuid(), 1, $1, $2, 'Móng xước', 'OPEN', now() - interval '36 hours')`,
        [gio, otherGroomId],
      );

      const all = await incidents.list(manager, new IncidentListQueryDto());
      expect(all.items).toHaveLength(1);

      const page = await incidents.list(groom, new IncidentListQueryDto());

      expect(page.items).toHaveLength(1);
    });

    it('N9b: a checklist item can be marked skipped with a reason', async () => {
      const columns = await dataSource.query<unknown[]>(
        `SELECT column_name FROM information_schema.columns
          WHERE table_name = 'daily_checklist_items' AND column_name ILIKE '%skip%'`,
      );

      expect(columns.length).toBeGreaterThan(0);
    });

    it('N17a: a veterinarian can attach a private care task to a horse', async () => {
      const type = await privateType();

      await expect(
        careTasks.createForHorse(vet, gio, {
          taskTypeId: type.id,
          fromDate: clubToday(),
          toDate: shiftDays(clubToday(), 3),
        }),
      ).resolves.toBeDefined();
    });

    it('N17b: approving a new ration while the horse has an open medical case notifies the vet', async () => {
      await seed.medicalCase(gio, vetId);
      const oats = await item(SupplyCategory.FEED);
      const [draft] = await plans.create(trainer, {
        horseIds: [gio],
        items: [
          {
            meal: FeedingMeal.EARLY_MORNING,
            supplyItemId: oats.id,
            quantity: 1,
          },
        ],
      });
      await dataSource.query('DELETE FROM outbox_events');

      await plans.approve(trainer, draft.id);

      expect(await eventsMentioning(gio)).not.toHaveLength(0);
    });

    it('D6: care task types carry a default time of day', async () => {
      const columns = await dataSource.query<unknown[]>(
        `SELECT column_name FROM information_schema.columns
          WHERE table_name = 'daily_task_types'
            AND (data_type LIKE 'time%' OR column_name ILIKE '%time%')
            AND column_name NOT IN ('created_at', 'updated_at', 'deleted_at')`,
      );

      expect(columns.length).toBeGreaterThan(0);
    });

    it('F4-8a: removing an in-effect private task drops its unticked line from today’s checklist', async () => {
      await careTasks.createType(manager, {
        name: 'Cho ăn',
        appliesToAll: true,
      });
      const type = await privateType();
      const task = await careTasks.createForHorse(trainer, gio, {
        taskTypeId: type.id,
        fromDate: clubToday(),
        toDate: shiftDays(clubToday(), 3),
      });
      expect(await todayItemsOfType(type.id)).toHaveLength(1);

      await careTasks.removeForHorse(trainer, task.id);

      expect(await todayItemsOfType(type.id)).toHaveLength(0);
    });

    it('F4-8b: deactivating a task type drops its unticked line from today’s checklist', async () => {
      const type = await careTasks.createType(manager, {
        name: 'Tắm rửa',
        appliesToAll: true,
      });
      await checklists.generateDay(clubToday());
      expect(await todayItemsOfType(type.id)).toHaveLength(1);

      await careTasks.updateType(manager, type.id, { active: false });

      expect(await todayItemsOfType(type.id)).toHaveLength(0);
    });

    it('F4-9: a private task removed by mistake today can be attached again the same day', async () => {
      const type = await privateType();
      const body = {
        taskTypeId: type.id,
        fromDate: clubToday(),
        toDate: shiftDays(clubToday(), 3),
      };
      const task = await careTasks.createForHorse(trainer, gio, body);
      await careTasks.removeForHorse(trainer, task.id);

      await expect(
        careTasks.createForHorse(trainer, gio, body),
      ).resolves.toBeDefined();
    });

    it('F4-10: renaming a task type does not rewrite past checklists', async () => {
      const type = await careTasks.createType(manager, {
        name: 'Tắm rửa',
        appliesToAll: true,
      });
      await checklists.generateDay(clubToday());

      const renamed = await careTasks
        .updateType(manager, type.id, { name: 'Chải lông' })
        .then(
          () => 'renamed',
          (error: unknown) => error,
        );
      const [checklist] = await checklists.listForHorse(groom, gio, {});

      expect(
        renamed instanceof ConflictException ||
          checklist.items[0].name === 'Tắm rửa',
      ).toBe(true);
    });
  });

  describe('feeding plans', () => {
    it('F4-3: an ACTIVE ration can be stopped without a replacement', () => {
      const routes = routesOf(FeedingPlansController as unknown as Ctor);

      expect(
        routes.some((path) =>
          /(stop|deactivate|suspend|archive|end|pause)/i.test(path),
        ),
      ).toBe(true);
    });
  });

  describe('incidents', () => {
    const reportAndRefer = async () => {
      const incident = await incidents.report(groom, {
        horseId: gio,
        description: 'Ngựa đi khập khiễng',
      });
      await incidents.refer(trainer, incident.id, { urgent: false });
      return incident.id;
    };

    it('F4-5: an incident whose exam is done but still OPEN keeps reminding the head trainer', async () => {
      const id = await reportAndRefer();
      await dataSource.query(
        'UPDATE medical_exam_requests SET status = $1 WHERE incident_id = $2',
        [ExamRequestStatus.EXAMINED, id],
      );
      await dataSource.query('DELETE FROM outbox_events');

      await reminders.remindStale(new Date(Date.now() + 7 * 86_400_000));

      expect(await eventsMentioning(id)).not.toHaveLength(0);
    });

    it('F4-6: the reporting groom is notified when the incident is referred and when it is resolved', async () => {
      const incident = await incidents.report(groom, {
        horseId: gio,
        description: 'Ngựa đi khập khiễng',
      });
      await dataSource.query('DELETE FROM outbox_events');

      await incidents.refer(trainer, incident.id, { urgent: false });
      const afterRefer = await eventsMentioning(groomId);
      await dataSource.query(
        'UPDATE medical_exam_requests SET status = $1 WHERE incident_id = $2',
        [ExamRequestStatus.EXAMINED, incident.id],
      );
      await dataSource.query('DELETE FROM outbox_events');
      await incidents.resolve(trainer, incident.id, {
        resolution: 'Đã băng móng',
      });
      const afterResolve = await eventsMentioning(groomId);

      expect([afterRefer.length > 0, afterResolve.length > 0]).toEqual([
        true,
        true,
      ]);
    });
  });

  describe('supplies', () => {
    it('N4: the manager has a stock adjustment route (not a fake restock)', () => {
      const routes = routesOf(SupplyItemsController as unknown as Ctor);

      expect(routes.some((path) => /adjust/i.test(path))).toBe(true);
    });

    it('N8a: a groom cannot take MEDICINE out of stock', async () => {
      const medicine = await item(SupplyCategory.MEDICINE);

      await expect(
        items.use(groom, medicine.id, { quantity: 1, note: 'x' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('N8b: taking non-medicine supplies requires a note', async () => {
      const oats = await item(SupplyCategory.FEED);

      await expect(
        items.use(groom, oats.id, { quantity: 1 }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('F4-12: a scheduled job reminds the manager of long-PENDING requests', () => {
      expect(cronsOf(SuppliesModule)).not.toHaveLength(0);
    });

    it.each(['create', 'edit', 'list', 'get'] as const)(
      'F4-15: a veterinarian can reach the supply request route %s',
      (method) => {
        const handler = Object.getOwnPropertyDescriptor(
          SupplyRequestsController.prototype,
          method,
        )?.value as object;
        const roles = Reflect.getMetadata(ACCESS_KEY, handler) as UserRole[];

        expect(roles).toContain(UserRole.VETERINARIAN);
      },
    );

    it.skip('N20: SKIP, BA must choose flat fee vs per-use billing first', () => {});
  });

  describe('fees and finance reports', () => {
    it('F4-4a: creating a new daily fee notifies horse owners', async () => {
      await dataSource.query('DELETE FROM outbox_events');

      await fees.create(manager, {
        effectiveFrom: shiftDays(clubToday(), 10),
        dailyFee: 2500000,
      });

      const [{ count }] = await dataSource.query<{ count: number }[]>(
        'SELECT COUNT(*)::int AS count FROM outbox_events',
      );
      expect(count).toBeGreaterThan(0);
    });

    it('F4-4b: a scheduled job sends owners their periodic cost report', () => {
      expect([
        ...cronsOf(BillingModule),
        ...cronsOf(ReportsModule),
      ]).not.toHaveLength(0);
    });

    it('F4-16: club finance returns the stock value', async () => {
      const report = await finance.clubFinance(manager, {});

      expect('stockValue' in report.supplies || 'stockValue' in report).toBe(
        true,
      );
    });

    it('F4-20: a report period longer than 366 days is rejected', async () => {
      await expect(
        finance.clubFinance(manager, { from: '2020-01-01' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('F4-21: owner cost for an account that is not a horse owner is 404', async () => {
      await expect(
        finance.ownerCost(manager, { ownerId: groomId }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('static (docs)', () => {
    it('F4-17 (static): docs state how supply values are rounded', () => {
      expect(docsText()).toMatch(
        /(vật tư|dòng sổ)[^\n]*làm tròn|làm tròn[^\n]*(vật tư|dòng sổ)/i,
      );
    });

    it('O-7 (static): docs record the uploaded-file cleanup debt', () => {
      expect(docsText()).toMatch(
        /(tệp|media|storage)[^\n.]{0,80}(dọn|rác|không ai tham chiếu)|ObjectStorageService\.delete/i,
      );
    });

    it('OB-9 (static): docs record dead outbox events and how to requeue them', () => {
      const text = docsText();
      expect(text).toMatch(/dead_at/);
      expect(text).toMatch(/SET dead_at = NULL/);
    });
  });
});

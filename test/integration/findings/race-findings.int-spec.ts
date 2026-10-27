import { HttpException } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';
import { Test, type TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { UserRole } from '../../../src/common/enums/role.enum';
import { DomainEventPublisher } from '../../../src/common/infrastructure/events/domain-event.publisher';
import { DomainEventsModule } from '../../../src/common/infrastructure/events/domain-events.module';
import type { Actor } from '../../../src/common/types/actor';
import { clubToday } from '../../../src/common/utils/club-date';
import { AuditService } from '../../../src/modules/audit/services/audit.service';
import { HorseOwnershipEntity } from '../../../src/modules/horses/entities/horse-ownership.entity';
import { HorseLifecycleStatus } from '../../../src/modules/horses/enums/horse-status.enum';
import { HorseOwnershipsService } from '../../../src/modules/horses/horse-ownerships/horse-ownerships.service';
import { HorseStatusesModule } from '../../../src/modules/horses/horse-statuses/horse-statuses.module';
import { HorseStatusesService } from '../../../src/modules/horses/horse-statuses/horse-statuses.service';
import { HorseAccessService } from '../../../src/modules/horses/shared/horse-access.service';
import { HorseOwnershipService } from '../../../src/modules/horses/shared/horse-ownership.service';
import type { MediaService } from '../../../src/modules/media/services/media.service';
import { MedicalExamRequestEntity } from '../../../src/modules/medical/entities/medical-exam-request.entity';
import { ExamRequestsService } from '../../../src/modules/medical/exam-requests/exam-requests.service';
import { MedicalAccessService } from '../../../src/modules/medical/shared/medical-access.service';
import { PerformanceEvaluationEntity } from '../../../src/modules/performance/entities/performance-evaluation.entity';
import { PerformanceEvaluationsService } from '../../../src/modules/performance/evaluations/performance-evaluations.service';
import { ChecklistsService } from '../../../src/modules/stable/daily-checklists/checklists.service';
import { DailyChecklistsModule } from '../../../src/modules/stable/daily-checklists/daily-checklists.module';
import { FeedingPlanEntity } from '../../../src/modules/stable/entities/feeding-plan.entity';
import { IncidentEntity } from '../../../src/modules/stable/entities/incident.entity';
import { FeedingPlansService } from '../../../src/modules/stable/feeding-plans/feeding-plans.service';
import { GroomAssignmentsModule } from '../../../src/modules/stable/groom-assignments/groom-assignments.module';
import { GroomAssignmentsService } from '../../../src/modules/stable/groom-assignments/groom-assignments.service';
import { IncidentsService } from '../../../src/modules/stable/incidents/incidents.service';
import { StableAccessService } from '../../../src/modules/stable/shared/stable-access.service';
import { SupplyItemEntity } from '../../../src/modules/supplies/entities/supply-item.entity';
import { SupplyLotEntity } from '../../../src/modules/supplies/entities/supply-lot.entity';
import { SupplyRequestEntity } from '../../../src/modules/supplies/entities/supply-request.entity';
import { SupplyStockMovementEntity } from '../../../src/modules/supplies/entities/supply-stock-movement.entity';
import { SupplyCategory } from '../../../src/modules/supplies/enums/supply-category.enum';
import { SupplyRequestStatus } from '../../../src/modules/supplies/enums/supply-request-status.enum';
import { SupplyItemsService } from '../../../src/modules/supplies/items/items.service';
import { SupplyRequestsService } from '../../../src/modules/supplies/requests/requests.service';
import { SupplyStockService } from '../../../src/modules/supplies/shared/supply-stock.service';
import { HorseEnrollmentEntity } from '../../../src/modules/training/entities/horse-enrollment.entity';
import { SessionParticipantEntity } from '../../../src/modules/training/entities/session-participant.entity';
import { TrainingAccessService } from '../../../src/modules/training/shared/training-access.service';
import { TrainingOperationsFacade } from '../../../src/modules/training/shared/training-operations.facade';
import { TrainingClassEnrollmentsService } from '../../../src/modules/training/training-classes/services/training-class-enrollments.service';
import { SessionParticipantsService } from '../../../src/modules/training/training-sessions/session-participants.service';
import { fixtures } from '../fixtures';
import {
  startTestPostgres,
  truncateAllTables,
  type TestPostgres,
} from '../postgres';

const ROUNDS = 10;
const HOUR = 3_600_000;

/** Kết quả một thao tác: 'ok', mã HTTP của lỗi domain, hoặc tên lớp lỗi thô kèm mã SQL */
type Outcome = number | string;

const outcomeOf = (result: PromiseSettledResult<unknown>): Outcome => {
  if (result.status === 'fulfilled') return 'ok';
  const error = result.reason as {
    constructor?: { name: string };
    code?: string;
    message?: string;
  };
  if (error instanceof HttpException) return error.getStatus();
  return `${error?.constructor?.name}(${error?.code ?? '-'}): ${error?.message}`;
};

const sorted = (outcomes: Outcome[]) => [...outcomes].map(String).sort();

describe('Race findings (Postgres, concurrent transactions)', () => {
  let db: TestPostgres;
  let dataSource: DataSource;
  let moduleRef: TestingModule;
  let seed: ReturnType<typeof fixtures>;
  let statuses: HorseStatusesService;
  let checklists: ChecklistsService;
  let grooms: GroomAssignmentsService;
  let ownerships: HorseOwnershipsService;
  let items: SupplyItemsService;
  let requests: SupplyRequestsService;
  let plans: FeedingPlansService;
  let incidents: IncidentsService;
  let enrollments: TrainingClassEnrollmentsService;
  let participants: SessionParticipantsService;
  let evaluations: PerformanceEvaluationsService;
  let cm: Actor;
  let cmId: string;
  let trainer: Actor;
  let trainerId: string;
  let barnId: string;
  let today: string;

  const actorOf = async (id: string, role: UserRole): Promise<Actor> => {
    const [row] = await dataSource.query<{ keycloak_id: string }[]>(
      'SELECT keycloak_id FROM users WHERE id = $1',
      [id],
    );
    return { sub: row.keycloak_id, roles: [role] };
  };

  /**
   * Giữ row lock ở một kết nối riêng, bắn các thao tác, chờ chúng xếp hàng sau lock rồi nhả để chúng chạy chồng nhau.
   * `steps` là danh sách thao tác; mỗi thao tác chỉ được bắn khi thao tác trước đã đứng chờ lock.
   */
  const contend = async (
    lockSql: string,
    params: unknown[],
    steps: Array<() => Promise<unknown>>,
  ): Promise<Outcome[]> => {
    const holder = dataSource.createQueryRunner();
    await holder.connect();
    await holder.startTransaction();
    await holder.query(lockSql, params);
    const running: Promise<unknown>[] = [];
    try {
      for (const step of steps) {
        running.push(step());
        await waitBlocked(running.length);
      }
    } finally {
      await holder.rollbackTransaction();
      await holder.release();
    }
    return (await Promise.allSettled(running)).map(outcomeOf);
  };

  const waitBlocked = async (count: number) => {
    for (let i = 0; i < 200; i++) {
      const [row] = await dataSource.query<{ n: number }[]>(
        `SELECT count(*)::int AS n FROM pg_stat_activity
          WHERE datname = current_database() AND wait_event_type = 'Lock'`,
      );
      if (row.n >= count) return;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    throw new Error(
      `setup: expected ${count} transaction(s) waiting on a lock`,
    );
  };

  const barnHorse = async (name: string) => {
    const owner = await seed.user(UserRole.HORSE_OWNER);
    const horse = await seed.horse(name, { barnId, ownerId: owner });
    await seed.ownership(horse, owner, '2026-01-01T00:00:00Z');
    return horse;
  };

  beforeAll(async () => {
    db = await startTestPostgres();
    dataSource = db.dataSource;
    seed = fixtures(dataSource);
    moduleRef = await Test.createTestingModule({
      imports: [
        EventEmitterModule.forRoot(),
        ScheduleModule.forRoot(),
        TypeOrmModule.forRootAsync({
          useFactory: () => ({ type: 'postgres' }),
          dataSourceFactory: () => Promise.resolve(dataSource),
        }),
        DomainEventsModule,
        HorseStatusesModule,
        DailyChecklistsModule,
        GroomAssignmentsModule,
      ],
    }).compile();
    statuses = moduleRef.get(HorseStatusesService);
    checklists = moduleRef.get(ChecklistsService);
    grooms = moduleRef.get(GroomAssignmentsService);

    const audit = new AuditService();
    const events = new DomainEventPublisher();
    const horseAccess = new HorseAccessService(dataSource);
    const stableAccess = new StableAccessService(horseAccess);
    const stock = new SupplyStockService();
    ownerships = new HorseOwnershipsService(
      dataSource.getRepository(HorseOwnershipEntity),
      horseAccess,
      new HorseOwnershipService(),
      dataSource,
      audit,
      { publish: jest.fn().mockResolvedValue(undefined) },
    );
    items = new SupplyItemsService(
      dataSource.getRepository(SupplyItemEntity),
      dataSource.getRepository(SupplyStockMovementEntity),
      dataSource.getRepository(SupplyLotEntity),
      stock,
      dataSource,
      audit,
      events,
    );
    requests = new SupplyRequestsService(
      dataSource.getRepository(SupplyRequestEntity),
      stock,
      dataSource,
      audit,
      events,
    );
    plans = new FeedingPlansService(
      dataSource.getRepository(FeedingPlanEntity),
      stableAccess,
      dataSource,
      audit,
    );
    incidents = new IncidentsService(
      dataSource.getRepository(IncidentEntity),
      stableAccess,
      horseAccess,
      {} as MediaService,
      new ExamRequestsService(
        dataSource,
        dataSource.getRepository(MedicalExamRequestEntity),
        {} as MedicalAccessService,
        horseAccess,
        audit,
        events,
      ),
      events,
      dataSource,
      audit,
    );
    const trainingAccess = new TrainingAccessService(dataSource, horseAccess);
    const facade = new TrainingOperationsFacade(
      new TrainingAccessService({} as DataSource, {} as HorseAccessService),
    );
    enrollments = new TrainingClassEnrollmentsService(
      dataSource.getRepository(HorseEnrollmentEntity),
      trainingAccess,
      facade,
      dataSource,
      {} as MediaService,
      audit,
    );
    participants = new SessionParticipantsService(
      dataSource.getRepository(SessionParticipantEntity),
      trainingAccess,
      facade,
      dataSource,
      {} as MediaService,
      audit,
      new DomainEventPublisher(),
    );
    evaluations = new PerformanceEvaluationsService(
      dataSource.getRepository(PerformanceEvaluationEntity),
      trainingAccess,
      facade,
      dataSource,
      audit,
    );
  });

  afterAll(async () => {
    await moduleRef?.close();
    await db?.container.stop();
  });

  beforeEach(async () => {
    await truncateAllTables(dataSource);
    today = clubToday();
    cmId = await seed.user(UserRole.CLUB_MANAGER);
    cm = await actorOf(cmId, UserRole.CLUB_MANAGER);
    trainerId = await seed.user(UserRole.HEAD_TRAINER);
    trainer = await actorOf(trainerId, UserRole.HEAD_TRAINER);
    barnId = await seed.barn('Khu A');
    await dataSource.query(
      'UPDATE barns SET head_trainer_id = $1 WHERE id = $2',
      [trainerId, barnId],
    );
  });

  it('R-0 the pool really runs transactions in parallel', async () => {
    const started = Date.now();
    await Promise.all([
      dataSource.query('SELECT pg_sleep(0.5)'),
      dataSource.query('SELECT pg_sleep(0.5)'),
    ]);
    expect(Date.now() - started).toBeLessThan(900);
  });

  it('R-1 two CMs record DECEASED for the same horse at once: one wins, the other gets 409', async () => {
    const rounds: Array<{ outcomes: string[]; stored: string }> = [];
    for (let i = 0; i < ROUNDS; i++) {
      const horse = await barnHorse(`Sương ${i}`);
      const death = () =>
        statuses.updateLifecycle(cm, horse, {
          lifecycleStatus: HorseLifecycleStatus.DECEASED,
          reason: 'Đau bụng',
        });
      const outcomes = await contend(
        'SELECT 1 FROM horses WHERE id = $1 FOR UPDATE',
        [horse],
        [death, death],
      );
      const [row] = await dataSource.query<{ date_of_death: string }[]>(
        `SELECT to_char(date_of_death, 'YYYY-MM-DD') AS date_of_death FROM horses WHERE id = $1`,
        [horse],
      );
      rounds.push({ outcomes: sorted(outcomes), stored: row.date_of_death });
    }

    expect(rounds.map((round) => round.outcomes)).toEqual(
      Array(ROUNDS).fill(['409', 'ok']),
    );
  });

  it('R-2 two usages that together exceed stock: one 409, stock never negative', async () => {
    const rounds: Array<{ outcomes: string[]; left: number }> = [];
    for (let i = 0; i < ROUNDS; i++) {
      const item = await items.create(cm, {
        name: `Yến mạch ${i}`,
        category: SupplyCategory.FEED,
        unit: 'kg',
        quantityOnHand: 10,
        reorderThreshold: 0,
      });
      const use = () => items.use(cm, item.id, { quantity: 6, note: 'Dùng' });
      const outcomes = await contend(
        'SELECT 1 FROM supply_items WHERE id = $1 FOR UPDATE',
        [item.id],
        [use, use],
      );
      const [row] = await dataSource.query<{ q: string }[]>(
        'SELECT quantity_on_hand AS q FROM supply_items WHERE id = $1',
        [item.id],
      );
      rounds.push({ outcomes: sorted(outcomes), left: Number(row.q) });
    }

    expect(rounds).toEqual(
      Array(ROUNDS).fill({ outcomes: ['409', 'ok'], left: 4 }),
    );
  });

  it('R-3 HT refers an incident while CM records the horse DECEASED: no deadlock, loser gets a domain error', async () => {
    const rounds: string[][] = [];
    for (let i = 0; i < 5; i++) {
      const horse = await barnHorse(`Bão ${i}`);
      const incidentId = randomUUID();
      await dataSource.query(
        `INSERT INTO incidents (id, version, horse_id, reported_by, description, status)
         VALUES ($1, 1, $2, $3, 'Đi khập khiễng', 'OPEN')`,
        [incidentId, horse, trainerId],
      );
      const outcomes = await contend(
        'SELECT 1 FROM horses WHERE id = $1 FOR UPDATE',
        [horse],
        [
          () =>
            statuses.updateLifecycle(cm, horse, {
              lifecycleStatus: HorseLifecycleStatus.DECEASED,
              reason: 'Ngã',
            }),
          () => incidents.refer(trainer, incidentId, { urgent: false }),
        ],
      );
      rounds.push(outcomes.map(String));
    }

    expect(
      rounds.filter((outcomes) =>
        outcomes.some((outcome) => outcome !== 'ok' && outcome !== '409'),
      ),
    ).toEqual([]);
  });

  it('R-4a two enrollments into a class with one seat left: one 409, class never over capacity', async () => {
    const rounds: Array<{ outcomes: string[]; active: number }> = [];
    for (let i = 0; i < ROUNDS; i++) {
      const { classId } = await seed.trainingClass(trainerId, {
        startDate: '2020-01-01',
        endDate: '2099-12-31',
      });
      await dataSource.query(
        'UPDATE training_classes SET max_horses = 2 WHERE id = $1',
        [classId],
      );
      await dataSource.query(
        `INSERT INTO horse_enrollments (version, class_id, horse_id, status, enrolled_at)
         VALUES (1, $1, $2, 'ACTIVE', '2020-01-01T00:00:00Z')`,
        [classId, await barnHorse(`Cũ ${i}`)],
      );
      const enroll = (horseId: string) => () =>
        enrollments.create(trainer, classId, { horseId });
      const outcomes = await contend(
        'SELECT 1 FROM training_classes WHERE id = $1 FOR UPDATE',
        [classId],
        [enroll(await barnHorse(`A ${i}`)), enroll(await barnHorse(`B ${i}`))],
      );
      const [row] = await dataSource.query<{ n: number }[]>(
        `SELECT count(*)::int AS n FROM horse_enrollments WHERE class_id = $1 AND status = 'ACTIVE'`,
        [classId],
      );
      rounds.push({ outcomes: sorted(outcomes), active: row.n });
    }

    expect(rounds).toEqual(
      Array(ROUNDS).fill({ outcomes: ['409', 'ok'], active: 2 }),
    );
  });

  it('R-4b the same horse enrolled twice into the same class at once: one 409, one active enrollment', async () => {
    const rounds: Array<{ outcomes: string[]; active: number }> = [];
    for (let i = 0; i < ROUNDS; i++) {
      const { classId } = await seed.trainingClass(trainerId, {
        startDate: '2020-01-01',
        endDate: '2099-12-31',
      });
      const horseId = await barnHorse(`Đôi ${i}`);
      const enroll = () => enrollments.create(trainer, classId, { horseId });
      const outcomes = await contend(
        'SELECT 1 FROM training_classes WHERE id = $1 FOR UPDATE',
        [classId],
        [enroll, enroll],
      );
      const [row] = await dataSource.query<{ n: number }[]>(
        `SELECT count(*)::int AS n FROM horse_enrollments WHERE class_id = $1 AND status = 'ACTIVE'`,
        [classId],
      );
      rounds.push({ outcomes: sorted(outcomes), active: row.n });
    }

    expect(rounds).toEqual(
      Array(ROUNDS).fill({ outcomes: ['409', 'ok'], active: 1 }),
    );
  });

  it('R-5 two drafts of the same horse approved at once: no raw 23505, exactly one ACTIVE plan', async () => {
    const rounds: Array<{ outcomes: string[]; active: number }> = [];
    for (let i = 0; i < ROUNDS; i++) {
      const horse = await barnHorse(`Khẩu phần ${i}`);
      const draft = async () => {
        const [row] = await dataSource.query<{ id: string }[]>(
          `INSERT INTO feeding_plans (version, horse_id, status, created_by)
           VALUES (1, $1, 'DRAFT', $2) RETURNING id`,
          [horse, trainerId],
        );
        return row.id;
      };
      const [a, b] = [await draft(), await draft()];
      const outcomes = await contend(
        'SELECT 1 FROM horses WHERE id = $1 FOR UPDATE',
        [horse],
        [() => plans.approve(trainer, a), () => plans.approve(trainer, b)],
      );
      const [row] = await dataSource.query<{ n: number }[]>(
        `SELECT count(*)::int AS n FROM feeding_plans WHERE horse_id = $1 AND status = 'ACTIVE'`,
        [horse],
      );
      rounds.push({ outcomes: sorted(outcomes), active: row.n });
    }

    expect(rounds).toEqual(
      Array(ROUNDS).fill({ outcomes: ['ok', 'ok'], active: 1 }),
    );
  });

  it('R-6 cron generateDay races a groom change: one checklist owned by the new groom, nothing swallowed in logs', async () => {
    await dataSource.query(
      `INSERT INTO daily_task_types (version, name, applies_to_all, active) VALUES (1, 'Cho ăn', true, true)`,
    );
    const logged = jest
      .spyOn(
        (checklists as unknown as { logger: { error: () => void } }).logger,
        'error',
      )
      .mockImplementation(() => undefined);
    const rounds: Array<{
      outcomes: string[];
      checklists: number;
      ownedByNew: boolean;
    }> = [];
    for (let i = 0; i < ROUNDS; i++) {
      const horse = await barnHorse(`Checklist ${i}`);
      const oldGroom = await seed.user(UserRole.GROOM);
      const newGroom = await seed.user(UserRole.GROOM);
      await dataSource.query(
        `INSERT INTO groom_assignments (version, horse_id, groom_id, start_at)
         VALUES (1, $1, $2, now() - interval '1 day')`,
        [horse, oldGroom],
      );
      const generate = () => checklists.generateDay(today);
      const assign = () => grooms.assign(trainer, horse, { groomId: newGroom });
      const outcomes = await contend(
        'SELECT 1 FROM horses WHERE id = $1 FOR UPDATE',
        [horse],
        i % 2 === 0 ? [generate, assign] : [assign, generate],
      );
      const rows = await dataSource.query<{ groom_id: string }[]>(
        'SELECT groom_id FROM daily_checklists WHERE horse_id = $1 AND checklist_date = $2',
        [horse, today],
      );
      rounds.push({
        outcomes: sorted(outcomes),
        checklists: rows.length,
        ownedByNew: rows[0]?.groom_id === newGroom,
      });
    }
    logged.mockRestore();

    expect(logged).not.toHaveBeenCalled();
    expect(rounds).toEqual(
      Array(ROUNDS).fill({
        outcomes: ['ok', 'ok'],
        checklists: 1,
        ownedByNew: true,
      }),
    );
  });

  it('R-7 two ownership transfers of the same horse at once: one 409, one open ownership period', async () => {
    const rounds: Array<{ outcomes: string[]; open: number }> = [];
    for (let i = 0; i < ROUNDS; i++) {
      const horse = await barnHorse(`Chủ ${i}`);
      const transfer = (newOwnerId: string) => () =>
        ownerships.transfer(cm, horse, {
          newOwnerId,
          reason: 'Bán',
          version: 1,
        });
      const outcomes = await contend(
        'SELECT 1 FROM horses WHERE id = $1 FOR UPDATE',
        [horse],
        [
          transfer(await seed.user(UserRole.HORSE_OWNER)),
          transfer(await seed.user(UserRole.HORSE_OWNER)),
        ],
      );
      const [row] = await dataSource.query<{ n: number }[]>(
        'SELECT count(*)::int AS n FROM horse_ownerships WHERE horse_id = $1 AND ended_at IS NULL',
        [horse],
      );
      rounds.push({ outcomes: sorted(outcomes), open: row.n });
    }

    expect(rounds).toEqual(
      Array(ROUNDS).fill({ outcomes: ['409', 'ok'], open: 1 }),
    );
  });

  it('R-8 the same supply request fulfilled twice at once: one 409, stock restocked once', async () => {
    const groom = await actorOf(
      await seed.user(UserRole.GROOM),
      UserRole.GROOM,
    );
    const rounds: Array<{ outcomes: string[]; stock: number; lots: number }> =
      [];
    for (let i = 0; i < ROUNDS; i++) {
      const item = await items.create(cm, {
        name: `Cám ${i}`,
        category: SupplyCategory.FEED,
        unit: 'kg',
        quantityOnHand: 10,
        reorderThreshold: 0,
      });
      const request = await requests.create(groom, { itemId: item.id });
      await requests.updateStatus(cm, request.id, {
        status: SupplyRequestStatus.APPROVED,
      });
      const fulfill = () =>
        requests.updateStatus(cm, request.id, {
          status: SupplyRequestStatus.FULFILLED,
          quantity: 50,
          unitPrice: 20000,
        });
      const outcomes = await contend(
        'SELECT 1 FROM supply_requests WHERE id = $1 FOR UPDATE',
        [request.id],
        [fulfill, fulfill],
      );
      const [row] = await dataSource.query<{ q: string; lots: number }[]>(
        `SELECT i.quantity_on_hand AS q,
                (SELECT count(*)::int FROM supply_lots l WHERE l.item_id = i.id) AS lots
           FROM supply_items i WHERE i.id = $1`,
        [item.id],
      );
      rounds.push({
        outcomes: sorted(outcomes),
        stock: Number(row.q),
        lots: row.lots,
      });
    }

    expect(rounds).toEqual(
      Array(ROUNDS).fill({ outcomes: ['409', 'ok'], stock: 60, lots: 2 }),
    );
  });

  const runningSession = async (classId: string) => {
    const id = randomUUID();
    await dataSource.query(
      `INSERT INTO training_sessions (id, version, class_id, name, session_type, scheduled_start_at, scheduled_end_at, status, intensity, planned_distance_m)
       VALUES ($1, 1, $2, 'Buổi', 'REGULAR', $3, $4, 'IN_PROGRESS', 'LIGHT', 1200)`,
      [
        id,
        classId,
        new Date(Date.now() - 0.25 * HOUR),
        new Date(Date.now() + HOUR),
      ],
    );
    return id;
  };

  const participantOf = async (
    sessionId: string,
    horseId: string,
    enrollmentId: string,
    status: string,
  ) => {
    const id = randomUUID();
    await dataSource.query(
      `INSERT INTO session_participants (id, version, session_id, horse_id, horse_enrollment_id, status, started_at, completed_at)
       VALUES ($1, 1, $2, $3, $4, $5, $6, $7)`,
      [
        id,
        sessionId,
        horseId,
        enrollmentId,
        status,
        status === 'READY' ? null : new Date(Date.now() - 0.2 * HOUR),
        status === 'COMPLETED' ? new Date() : null,
      ],
    );
    return id;
  };

  const enrolled = async (name: string) => {
    const { classId } = await seed.trainingClass(trainerId, {
      startDate: '2020-01-01',
      endDate: '2099-12-31',
    });
    const horseId = await barnHorse(name);
    const [row] = await dataSource.query<{ id: string }[]>(
      `INSERT INTO horse_enrollments (version, class_id, horse_id, status, enrolled_at)
       VALUES (1, $1, $2, 'ACTIVE', '2020-01-01T00:00:00Z') RETURNING id`,
      [classId, horseId],
    );
    return { classId, horseId, enrollmentId: row.id };
  };

  it('R-9 the same horse started in two sessions at once: one 409, only one ONGOING', async () => {
    const rounds: Array<{ outcomes: string[]; ongoing: number }> = [];
    for (let i = 0; i < ROUNDS; i++) {
      const { classId, horseId, enrollmentId } = await enrolled(`Tập ${i}`);
      const first = await participantOf(
        await runningSession(classId),
        horseId,
        enrollmentId,
        'READY',
      );
      const second = await participantOf(
        await runningSession(classId),
        horseId,
        enrollmentId,
        'READY',
      );
      const outcomes = await contend(
        'SELECT 1 FROM horses WHERE id = $1 FOR UPDATE',
        [horseId],
        [
          () => participants.start(trainer, first),
          () => participants.start(trainer, second),
        ],
      );
      const [row] = await dataSource.query<{ n: number }[]>(
        `SELECT count(*)::int AS n FROM session_participants WHERE horse_id = $1 AND status = 'ONGOING'`,
        [horseId],
      );
      rounds.push({ outcomes: sorted(outcomes), ongoing: row.n });
    }

    expect(rounds).toEqual(
      Array(ROUNDS).fill({ outcomes: ['409', 'ok'], ongoing: 1 }),
    );
  });

  it('R-10 two HTs evaluating the same completed run at once: one 409, not a raw unique violation', async () => {
    const rounds: string[][] = [];
    for (let i = 0; i < ROUNDS; i++) {
      const { classId, horseId, enrollmentId } = await enrolled(
        `Đánh giá ${i}`,
      );
      const done = await participantOf(
        await runningSession(classId),
        horseId,
        enrollmentId,
        'COMPLETED',
      );
      const evaluate = () => evaluations.create(trainer, done, { score: 8 });
      const outcomes = await contend(
        `INSERT INTO performance_evaluations (version, session_participant_id, evaluator_id, score)
         VALUES (1, $1, $2, 1)`,
        [done, trainerId],
        [evaluate, evaluate],
      );
      rounds.push(sorted(outcomes));
    }

    expect(rounds).toEqual(Array(ROUNDS).fill(['409', 'ok']));
  });
});

import { HorseAccessService } from '../../../src/modules/horses/shared/horse-access.service';
import { TrainingAccessService } from '../../../src/modules/training/shared/training-access.service';
import { HttpException } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { Test, type TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { UserRole } from '../../../src/common/enums/role.enum';
import { UserStatus } from '../../../src/common/enums/user-status.enum';
import { DomainEventPublisher } from '../../../src/common/infrastructure/events/domain-event.publisher';
import { DomainEventsModule } from '../../../src/common/infrastructure/events/domain-events.module';
import type { KeycloakUserService } from '../../../src/common/infrastructure/keycloak/user.service';
import type { Actor } from '../../../src/common/types/actor';
import { clubToday, shiftDays } from '../../../src/common/utils/club-date';
import { AuditService } from '../../../src/modules/audit/services/audit.service';
import { HorsePlacementsModule } from '../../../src/modules/horses/horse-placements/horse-placements.module';
import { HorsePlacementsService } from '../../../src/modules/horses/horse-placements/horse-placements.service';
import { MediaService } from '../../../src/modules/media/services/media.service';
import { MedicalCasesService } from '../../../src/modules/medical/medical-records/medical-cases.service';
import { MedicalRecordsModule } from '../../../src/modules/medical/medical-records/medical-records.module';
import { BarnsModule } from '../../../src/modules/stable/barns/barns.module';
import { BarnsService } from '../../../src/modules/stable/barns/barns.service';
import { CareTasksModule } from '../../../src/modules/stable/care-tasks/care-tasks.module';
import { CareTasksService } from '../../../src/modules/stable/care-tasks/care-tasks.service';
import { GroomAssignmentsModule } from '../../../src/modules/stable/groom-assignments/groom-assignments.module';
import { GroomAssignmentsService } from '../../../src/modules/stable/groom-assignments/groom-assignments.service';
import { IncidentsModule } from '../../../src/modules/stable/incidents/incidents.module';
import { IncidentsService } from '../../../src/modules/stable/incidents/incidents.service';
import { StallsModule } from '../../../src/modules/stable/stalls/stalls.module';
import { StallsService } from '../../../src/modules/stable/stalls/stalls.service';
import { SupplyItemEntity } from '../../../src/modules/supplies/entities/supply-item.entity';
import { SupplyLotEntity } from '../../../src/modules/supplies/entities/supply-lot.entity';
import { SupplyStockMovementEntity } from '../../../src/modules/supplies/entities/supply-stock-movement.entity';
import { SupplyCategory } from '../../../src/modules/supplies/enums/supply-category.enum';
import { SupplyItemsService } from '../../../src/modules/supplies/items/items.service';
import { SupplyStockService } from '../../../src/modules/supplies/shared/supply-stock.service';
import { TrainingIntensity } from '../../../src/modules/training/enums/training-intensity.enum';
import { TrainingClassStatus } from '../../../src/modules/training/enums/training-class-status.enum';
import { TrainingOperationsFacade } from '../../../src/modules/training/shared/training-operations.facade';
import { TrainingClassEnrollmentsService } from '../../../src/modules/training/training-classes/services/training-class-enrollments.service';
import { TrainingClassesService } from '../../../src/modules/training/training-classes/services/training-classes.service';
import { TrainingClassesModule } from '../../../src/modules/training/training-classes/training-classes.module';
import { SessionParticipantsService } from '../../../src/modules/training/training-sessions/session-participants.service';
import { TrainingSessionsModule } from '../../../src/modules/training/training-sessions/training-sessions.module';
import { TrainingSessionsService } from '../../../src/modules/training/training-sessions/training-sessions.service';
import { UserEntity } from '../../../src/modules/users/entities/user.entity';
import { HeadTrainerHandoverService } from '../../../src/modules/users/services/head-trainer-handover.service';
import { UsersService } from '../../../src/modules/users/services/users.service';
import { fixtures } from '../fixtures';
import {
  startTestPostgres,
  truncateAllTables,
  type TestPostgres,
} from '../postgres';

const ROUNDS = 3;
const HOUR = 3_600_000;

/** Kết quả một thao tác: 'ok', mã HTTP của lỗi domain, hoặc tên lớp lỗi thô kèm mã SQL */
type Outcome = number | string;

const outcomeOf = (result: PromiseSettledResult<unknown>): Outcome => {
  if (result.status === 'fulfilled') return 'ok';
  const error = result.reason as {
    constructor?: { name: string };
    code?: string;
    driverError?: { code?: string };
    message?: string;
  };
  if (error instanceof HttpException) return error.getStatus();
  return `${error?.constructor?.name}(${error?.driverError?.code ?? error?.code ?? '-'})`;
};

const sorted = (outcomes: Outcome[]) => [...outcomes].map(String).sort();

/** Chỉ chấp nhận 'ok' hoặc lỗi domain 4xx; mọi lỗi DB thô (40P01, 23505, 22003...) bị giữ lại */
const rawErrors = (rounds: Outcome[][]) =>
  rounds
    .flat()
    .filter((outcome) => outcome !== 'ok' && typeof outcome !== 'number');

describe('Race findings R3 (Postgres, concurrent transactions)', () => {
  let db: TestPostgres;
  let dataSource: DataSource;
  let moduleRef: TestingModule;
  let seed: ReturnType<typeof fixtures>;
  let placements: HorsePlacementsService;
  let grooms: GroomAssignmentsService;
  let stalls: StallsService;
  let barns: BarnsService;
  let careTasks: CareTasksService;
  let classes: TrainingClassesService;
  let enrollments: TrainingClassEnrollmentsService;
  let sessions: TrainingSessionsService;
  let participants: SessionParticipantsService;
  let incidents: IncidentsService;
  let cases: MedicalCasesService;
  let users: UsersService;
  let handover: HeadTrainerHandoverService;
  let items: SupplyItemsService;
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
    for (let i = 0; i < 300; i++) {
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

  const barnHorse = async (name: string, inBarn = barnId) => {
    const owner = await seed.user(UserRole.HORSE_OWNER);
    const horse = await seed.horse(name, { barnId: inBarn, ownerId: owner });
    await seed.ownership(horse, owner, '2026-01-01T00:00:00Z');
    return horse;
  };

  const stall = async (inBarn: string, code: string) => {
    const id = randomUUID();
    await dataSource.query(
      'INSERT INTO stalls (id, version, barn_id, code) VALUES ($1, 1, $2, $3)',
      [id, inBarn, code],
    );
    return id;
  };

  const headTrainer = async () => {
    const id = await seed.user(UserRole.HEAD_TRAINER);
    return { id, actor: await actorOf(id, UserRole.HEAD_TRAINER) };
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

  const session = async (
    classId: string,
    status: string,
    startsInHours: number,
  ) => {
    const id = randomUUID();
    await dataSource.query(
      `INSERT INTO training_sessions (id, version, class_id, name, session_type, scheduled_start_at, scheduled_end_at, status, intensity, planned_distance_m)
       VALUES ($1, 1, $2, 'Buổi', 'REGULAR', $3, $4, $5, 'LIGHT', 1200)`,
      [
        id,
        classId,
        new Date(Date.now() + startsInHours * HOUR),
        new Date(Date.now() + (startsInHours + 1.25) * HOUR),
        status,
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
      `INSERT INTO session_participants (id, version, session_id, horse_id, horse_enrollment_id, status)
       VALUES ($1, 1, $2, $3, $4, $5)`,
      [id, sessionId, horseId, enrollmentId, status],
    );
    return id;
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
        HorsePlacementsModule,
        GroomAssignmentsModule,
        StallsModule,
        BarnsModule,
        CareTasksModule,
        TrainingClassesModule,
        TrainingSessionsModule,
        IncidentsModule,
        MedicalRecordsModule,
      ],
    })
      .overrideProvider(MediaService)
      .useValue({})
      .compile();
    placements = moduleRef.get(HorsePlacementsService);
    grooms = moduleRef.get(GroomAssignmentsService);
    stalls = moduleRef.get(StallsService);
    barns = moduleRef.get(BarnsService);
    careTasks = moduleRef.get(CareTasksService);
    classes = moduleRef.get(TrainingClassesService);
    enrollments = moduleRef.get(TrainingClassEnrollmentsService);
    sessions = moduleRef.get(TrainingSessionsService);
    participants = moduleRef.get(SessionParticipantsService);
    incidents = moduleRef.get(IncidentsService);
    cases = moduleRef.get(MedicalCasesService);

    const audit = new AuditService();
    users = new UsersService(
      dataSource.getRepository(UserEntity),
      {
        setUserEnabled: jest.fn().mockResolvedValue(undefined),
        logoutUser: jest.fn().mockResolvedValue(undefined),
      } as unknown as KeycloakUserService,
      dataSource,
      audit,
    );
    handover = new HeadTrainerHandoverService(
      dataSource,
      barns,
      new TrainingOperationsFacade(
        new TrainingAccessService({} as DataSource, {} as HorseAccessService),
      ),
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

  it('R3-1 placing a horse (horse → groom) while the HT assigns the same groom (groom → horse): no deadlock 40P01', async () => {
    const rounds: Outcome[][] = [];
    for (let i = 0; i < ROUNDS; i++) {
      const horse = await barnHorse(`Xếp ${i}`);
      const target = await stall(barnId, `O-${i}`);
      const groomId = await seed.user(UserRole.GROOM);
      rounds.push(
        await contend(
          'SELECT 1 FROM stalls WHERE id = $1 FOR UPDATE',
          [target],
          [
            () =>
              placements.placeHorse(trainer, horse, {
                stallId: target,
                groomId,
              }),
            () => grooms.assign(trainer, horse, { groomId }),
          ],
        ),
      );
    }

    expect(rawErrors(rounds)).toEqual([]);
  });

  it('R3-2 two opposite head trainer handovers (A→B and B→A) at once: no deadlock 40P01', async () => {
    const rounds: Outcome[][] = [];
    for (let i = 0; i < ROUNDS; i++) {
      const a = await headTrainer();
      const b = await headTrainer();
      rounds.push(
        await contend(
          'SELECT 1 FROM users WHERE id = $1 FOR UPDATE',
          [a.id],
          [
            () => handover.handover(cm, a.id, { toHeadTrainerId: b.id }),
            () => handover.handover(cm, b.id, { toHeadTrainerId: a.id }),
          ],
        ),
      );
    }

    expect(rawErrors(rounds)).toEqual([]);
  });

  it('R3-3 moving a stall between two barns (barns by UUID) during a handover of their HT (barns by name): no deadlock 40P01', async () => {
    const rounds: Outcome[][] = [];
    for (let i = 0; i < ROUNDS; i++) {
      const a = await headTrainer();
      const b = await headTrainer();
      const [low, high] = [randomUUID(), randomUUID()].sort();
      await dataSource.query(
        `INSERT INTO barns (id, version, name, head_trainer_id) VALUES ($1, 1, $2, $4), ($3, 1, $5, $4)`,
        [low, `Zeta ${i}`, high, a.id, `Alpha ${i}`],
      );
      const moving = await stall(low, `M-${i}`);
      rounds.push(
        await contend(
          'SELECT 1 FROM barns WHERE id = $1 FOR UPDATE',
          [low],
          [
            () => stalls.update(cm, moving, { barnId: high }),
            () => handover.handover(cm, a.id, { toHeadTrainerId: b.id }),
          ],
        ),
      );
    }

    expect(rawErrors(rounds)).toEqual([]);
  });

  it('R3-4 CM deactivates a head trainer while another CM gives him a barn: never a barn headed by an inactive HT', async () => {
    const rounds: Array<{ outcomes: string[]; inactiveHead: boolean }> = [];
    for (let i = 0; i < ROUNDS; i++) {
      const ht = await headTrainer();
      const emptyBarn = await seed.barn(`Trống ${i}`);
      const outcomes = await contend(
        'SELECT 1 FROM users WHERE id = $1 FOR UPDATE',
        [ht.id],
        [
          () => users.setStatus(cm, ht.id, UserStatus.INACTIVE),
          () => barns.update(cm, emptyBarn, { headTrainerId: ht.id }),
        ],
      );
      const [row] = await dataSource.query<{ status: string | null }[]>(
        `SELECT u.status FROM barns b LEFT JOIN users u ON u.id = b.head_trainer_id WHERE b.id = $1`,
        [emptyBarn],
      );
      rounds.push({
        outcomes: sorted(outcomes),
        inactiveHead: row.status !== null && row.status !== 'ACTIVE',
      });
    }

    expect(rounds).toEqual(
      Array(ROUNDS).fill({ outcomes: ['409', 'ok'], inactiveHead: false }),
    );
  });

  it('R3-5 the same horse care task removed twice at once: one 404, one DELETE audit row', async () => {
    const [type] = await dataSource.query<{ id: string }[]>(
      `INSERT INTO daily_task_types (version, name, applies_to_all, active) VALUES (1, 'Chườm đá', false, true) RETURNING id`,
    );
    const rounds: Array<{ outcomes: string[]; audits: number }> = [];
    for (let i = 0; i < ROUNDS; i++) {
      const horse = await barnHorse(`Việc ${i}`);
      const [task] = await dataSource.query<{ id: string }[]>(
        `INSERT INTO horse_daily_tasks (horse_id, task_type_id, from_date, to_date, created_by)
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [horse, type.id, shiftDays(today, 1), shiftDays(today, 5), trainerId],
      );
      const remove = () => careTasks.removeForHorse(trainer, task.id);
      const outcomes = await contend(
        'SELECT 1 FROM horses WHERE id = $1 FOR UPDATE',
        [horse],
        [remove, remove],
      );
      const [row] = await dataSource.query<{ n: number }[]>(
        `SELECT count(*)::int AS n FROM audit_logs WHERE entity_id = $1 AND action = 'DELETE'`,
        [task.id],
      );
      rounds.push({ outcomes: sorted(outcomes), audits: row.n });
    }

    expect(rounds).toEqual(
      Array(ROUNDS).fill({ outcomes: ['404', 'ok'], audits: 1 }),
    );
  });

  it('R3-6 two HTs create a class with the same code at once: one 409, not a raw unique violation', async () => {
    const rounds: string[][] = [];
    for (let i = 0; i < ROUNDS; i++) {
      const { planId } = await seed.trainingClass(trainerId, { weeks: 4 });
      const [line] = await dataSource.query<{ subject_id: string }[]>(
        `SELECT s.subject_id FROM training_plan_subjects s
           JOIN training_plan_phases p ON p.id = s.phase_id WHERE p.plan_id = $1`,
        [planId],
      );
      const code = `DUP-${i}`;
      const create = () =>
        classes.create(trainer, {
          code,
          name: `Lớp ${code}`,
          planId,
          startDate: '2026-11-02',
        });
      const outcomes = await contend(
        `INSERT INTO training_classes (id, version, name, code, head_trainer_id, plan_id, start_date, end_date, status)
         VALUES ($1, 1, 'Giữ chỗ', $2, $3, $4, '2026-11-02', '2026-11-29', 'ACTIVE')`,
        [randomUUID(), code, trainerId, planId],
        [create, create],
      );
      rounds.push(sorted(outcomes));
    }

    expect(rounds).toEqual(Array(ROUNDS).fill(['409', 'ok']));
  });

  it('R3-7 HT starts a run while the class is being cancelled: never an ONGOING run in a cancelled class', async () => {
    const rounds: Array<{ outcomes: string[]; orphanOngoing: number }> = [];
    for (let i = 0; i < ROUNDS; i++) {
      const { classId, horseId, enrollmentId } = await enrolled(`Hủy ${i}`);
      const sessionId = await session(classId, 'IN_PROGRESS', -0.25);
      const participantId = await participantOf(
        sessionId,
        horseId,
        enrollmentId,
        'READY',
      );
      const outcomes = await contend(
        'SELECT 1 FROM training_sessions WHERE id = $1 FOR UPDATE',
        [sessionId],
        [
          () => participants.start(trainer, participantId),
          () =>
            classes.updateStatus(trainer, classId, {
              status: TrainingClassStatus.CANCELLED,
              cancelReason: 'Hết ngân sách',
            }),
        ],
      );
      const [row] = await dataSource.query<{ n: number }[]>(
        `SELECT count(*)::int AS n FROM session_participants p
           JOIN training_sessions s ON s.id = p.session_id
           JOIN training_classes c ON c.id = s.class_id
          WHERE p.status = 'ONGOING' AND (c.status = 'CANCELLED' OR s.status = 'CANCELLED') AND c.id = $1`,
        [classId],
      );
      rounds.push({ outcomes: sorted(outcomes), orphanOngoing: row.n });
    }

    expect(rounds).toEqual(
      Array(ROUNDS).fill({ outcomes: ['409', 'ok'], orphanOngoing: 0 }),
    );
  });

  it('R3-9 a horse leaves the class (participant → session) while the HT assigns a groom to its run (session → participant): no deadlock 40P01', async () => {
    const rounds: Outcome[][] = [];
    for (let i = 0; i < ROUNDS; i++) {
      const { classId, horseId, enrollmentId } = await enrolled(`Rời ${i}`);
      const sessionId = await session(classId, 'SCHEDULED', 24);
      const participantId = await participantOf(
        sessionId,
        horseId,
        enrollmentId,
        'PLANNED',
      );
      rounds.push(
        await contend(
          'SELECT 1 FROM session_participants WHERE id = $1 FOR UPDATE',
          [participantId],
          [
            () => enrollments.leave(trainer, enrollmentId, {}),
            () =>
              participants.assignGroom(trainer, participantId, {
                groomId: null,
              }),
          ],
        ),
      );
    }

    expect(rawErrors(rounds)).toEqual([]);
  });

  it('R3-10 vet closes a case recording death while the HT refers an incident of the horse: no deadlock 40P01', async () => {
    const vetId = await seed.user(UserRole.VETERINARIAN);
    const vet = await actorOf(vetId, UserRole.VETERINARIAN);
    const rounds: Outcome[][] = [];
    for (let i = 0; i < ROUNDS; i++) {
      const horse = await barnHorse(`Ca ${i}`);
      const caseId = await seed.medicalCase(horse, vetId);
      const incidentId = randomUUID();
      await dataSource.query(
        `INSERT INTO incidents (id, version, horse_id, reported_by, description, status)
         VALUES ($1, 1, $2, $3, 'Đi khập khiễng', 'OPEN')`,
        [incidentId, horse, trainerId],
      );
      rounds.push(
        await contend(
          'SELECT 1 FROM horses WHERE id = $1 FOR UPDATE',
          [horse],
          [
            () =>
              cases.closeCase(vet, caseId, {
                finalConclusion: 'Không qua khỏi',
                dateOfDeath: today,
              }),
            () => incidents.refer(trainer, incidentId, { urgent: false }),
          ],
        ),
      );
    }

    expect(rawErrors(rounds)).toEqual([]);
  });

  it('R3-11 ten max-size receipts push stock past numeric(12,2): the last one gets a domain error, not a raw 22003', async () => {
    const item = await items.create(cm, {
      name: 'Cỏ khô',
      category: SupplyCategory.FEED,
      unit: 'kg',
      quantityOnHand: 0,
      reorderThreshold: 0,
    });
    const outcomes: Outcome[] = [];
    for (let i = 0; i < 10; i++) {
      outcomes.push(
        await items
          .receive(cm, item.id, { quantity: 1_000_000_000, unitPrice: 1000 })
          .then(
            (): Outcome => 'ok',
            (error: unknown) =>
              outcomeOf({ status: 'rejected', reason: error }),
          ),
      );
    }

    expect(outcomes.slice(0, 9)).toEqual(Array(9).fill('ok'));
    expect(outcomes[9]).toEqual(expect.any(Number));
  });

  it('R3-12 class maxHorses beyond int range: rejected with a domain error, not a raw 22003', async () => {
    const { planId } = await seed.trainingClass(trainerId, { weeks: 4 });
    const [line] = await dataSource.query<{ subject_id: string }[]>(
      `SELECT s.subject_id FROM training_plan_subjects s
         JOIN training_plan_phases p ON p.id = s.phase_id WHERE p.plan_id = $1`,
      [planId],
    );
    const outcome = await classes
      .create(trainer, {
        code: 'BIG-1',
        name: 'Lớp lớn',
        planId,
        maxHorses: 3_000_000_000,
        startDate: '2026-11-02',
      })
      .then(
        (): Outcome => 'ok',
        (error: unknown) => outcomeOf({ status: 'rejected', reason: error }),
      );

    expect(outcome).toEqual(expect.any(Number));
  });
});

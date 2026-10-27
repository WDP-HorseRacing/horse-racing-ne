import { HorseAccessService } from '../../../src/modules/horses/shared/horse-access.service';
import { TrainingAccessService } from '../../../src/modules/training/shared/training-access.service';
import { HttpException } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';
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
import { HorseMeasurementType } from '../../../src/modules/horses/enums/horse-measurement-type.enum';
import { HorseMeasurementsModule } from '../../../src/modules/horses/horse-measurements/horse-measurements.module';
import { HorseMeasurementsService } from '../../../src/modules/horses/horse-measurements/horse-measurements.service';
import { HorseOwnershipsModule } from '../../../src/modules/horses/horse-ownerships/horse-ownerships.module';
import { HorseOwnershipsService } from '../../../src/modules/horses/horse-ownerships/horse-ownerships.service';
import { HorsePlacementsModule } from '../../../src/modules/horses/horse-placements/horse-placements.module';
import { HorsePlacementsService } from '../../../src/modules/horses/horse-placements/horse-placements.service';
import { MediaService } from '../../../src/modules/media/services/media.service';
import { MedicalCasesService } from '../../../src/modules/medical/medical-records/medical-cases.service';
import { MedicalRecordsModule } from '../../../src/modules/medical/medical-records/medical-records.module';
import { BarnsModule } from '../../../src/modules/stable/barns/barns.module';
import { BarnsService } from '../../../src/modules/stable/barns/barns.service';
import { CareTasksModule } from '../../../src/modules/stable/care-tasks/care-tasks.module';
import { CareTasksService } from '../../../src/modules/stable/care-tasks/care-tasks.service';
import { ChecklistsService } from '../../../src/modules/stable/daily-checklists/checklists.service';
import { DailyChecklistsModule } from '../../../src/modules/stable/daily-checklists/daily-checklists.module';
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
import { TrainingPlansModule } from '../../../src/modules/training/training-plans/training-plans.module';
import { TrainingPlansService } from '../../../src/modules/training/training-plans/training-plans.service';
import { TrainingClassesModule } from '../../../src/modules/training/training-classes/training-classes.module';
import { SessionParticipantsService } from '../../../src/modules/training/training-sessions/session-participants.service';
import { TrainingSessionsModule } from '../../../src/modules/training/training-sessions/training-sessions.module';
import { TrainingSessionsService } from '../../../src/modules/training/training-sessions/training-sessions.service';
import { UserEntity } from '../../../src/modules/users/entities/user.entity';
import { HeadTrainerHandoverService } from '../../../src/modules/users/services/head-trainer-handover.service';
import { UsersService } from '../../../src/modules/users/services/users.service';
import { RealtimeGateway } from '../../../src/modules/realtime/realtime.gateway';
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
  let checklists: ChecklistsService;
  let measurements: HorseMeasurementsService;
  let ownerships: HorseOwnershipsService;
  let plans: TrainingPlansService;
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
        ScheduleModule.forRoot(),
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
        DailyChecklistsModule,
        HorseMeasurementsModule,
        HorseOwnershipsModule,
        TrainingPlansModule,
      ],
    })
      .overrideProvider(MediaService)
      .useValue({ signDownloadUrls: () => Promise.resolve(new Map()) })
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
    checklists = moduleRef.get(ChecklistsService);
    measurements = moduleRef.get(HorseMeasurementsService);
    ownerships = moduleRef.get(HorseOwnershipsService);
    plans = moduleRef.get(TrainingPlansService);

    const audit = new AuditService();
    users = new UsersService(
      dataSource.getRepository(UserEntity),
      {
        setUserEnabled: jest.fn().mockResolvedValue(undefined),
        logoutUser: jest.fn().mockResolvedValue(undefined),
      } as unknown as KeycloakUserService,
      dataSource,
      audit,
      { disconnectUser: jest.fn() } as unknown as RealtimeGateway,
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
                deceased: true,
              }),
            () => incidents.refer(trainer, incidentId, { urgent: false }),
          ],
        ),
      );
    }

    expect(rawErrors(rounds)).toEqual([]);
  });

  /** Ngựa trong khu A có Groom cũ đang phụ trách, kèm một Groom mới để HT đổi sang */
  const groomedHorse = async (name: string) => {
    const horseId = await barnHorse(name);
    const oldGroomId = await seed.user(UserRole.GROOM);
    await dataSource.query(
      `INSERT INTO groom_assignments (version, horse_id, groom_id, start_at)
       VALUES (1, $1, $2, now() - interval '1 day')`,
      [horseId, oldGroomId],
    );
    return {
      horseId,
      oldGroom: await actorOf(oldGroomId, UserRole.GROOM),
      newGroomId: await seed.user(UserRole.GROOM),
    };
  };

  it('R3-DL-a1 the groom reports an incident (horse) while the HT changes the groom of that horse: no deadlock 40P01', async () => {
    const rounds: Outcome[][] = [];
    for (let i = 0; i < ROUNDS; i++) {
      const { horseId, oldGroom, newGroomId } = await groomedHorse(`Báo ${i}`);
      rounds.push(
        await contend(
          'SELECT 1 FROM horses WHERE id = $1 FOR UPDATE',
          [horseId],
          [
            () =>
              incidents.report(oldGroom, {
                horseId,
                description: 'Đi khập khiễng',
              }),
            () => grooms.assign(trainer, horseId, { groomId: newGroomId }),
          ],
        ),
      );
    }

    expect(rawErrors(rounds)).toEqual([]);
  });

  it('R3-DL-a2 the groom ticks today checklist (checklist) while the HT changes the groom of that horse: no deadlock 40P01', async () => {
    const [type] = await dataSource.query<{ id: string }[]>(
      `INSERT INTO daily_task_types (version, name, applies_to_all, active) VALUES (1, 'Cho ăn', true, true) RETURNING id`,
    );
    const rounds: Outcome[][] = [];
    for (let i = 0; i < ROUNDS; i++) {
      const { horseId, oldGroom, newGroomId } = await groomedHorse(`Tick ${i}`);
      const [checklist] = await dataSource.query<{ id: string }[]>(
        `INSERT INTO daily_checklists (version, horse_id, groom_id, checklist_date, status)
         SELECT 1, $1, groom_id, $2, 'PENDING' FROM groom_assignments WHERE horse_id = $1 RETURNING id`,
        [horseId, today],
      );
      const [item] = await dataSource.query<{ id: string }[]>(
        `INSERT INTO daily_checklist_items (checklist_id, task_type_id, position)
         VALUES ($1, $2, 1) RETURNING id`,
        [checklist.id, type.id],
      );
      rounds.push(
        await contend(
          'SELECT 1 FROM daily_checklists WHERE id = $1 FOR UPDATE',
          [checklist.id],
          [
            () => checklists.tick(oldGroom, item.id, { done: true }),
            () => grooms.assign(trainer, horseId, { groomId: newGroomId }),
          ],
        ),
      );
    }

    expect(rawErrors(rounds)).toEqual([]);
  });

  it('R3-DL-a3 the groom records a measurement (horse) while the HT changes the groom of that horse: no deadlock 40P01', async () => {
    const rounds: Outcome[][] = [];
    for (let i = 0; i < ROUNDS; i++) {
      const { horseId, oldGroom, newGroomId } = await groomedHorse(`Đo ${i}`);
      rounds.push(
        await contend(
          'SELECT 1 FROM horses WHERE id = $1 FOR UPDATE',
          [horseId],
          [
            () =>
              measurements.addMeasurements(oldGroom, horseId, {
                values: [{ type: HorseMeasurementType.WEIGHT, value: 500 }],
                confirmAbnormal: true,
              }),
            () => grooms.assign(trainer, horseId, { groomId: newGroomId }),
          ],
        ),
      );
    }

    expect(rawErrors(rounds)).toEqual([]);
  });

  it('R3-DL-b CM deactivates user X (managers → X) while another CM transfers a horse to X (horse → X → manager): no deadlock 40P01', async () => {
    const otherCm = await actorOf(
      await seed.user(UserRole.CLUB_MANAGER),
      UserRole.CLUB_MANAGER,
    );
    const rounds: Outcome[][] = [];
    for (let i = 0; i < ROUNDS; i++) {
      const horseId = await barnHorse(`Chủ ${i}`);
      const newOwnerId = await seed.user(UserRole.HORSE_OWNER);
      const [horse] = await dataSource.query<{ version: number }[]>(
        'SELECT version FROM horses WHERE id = $1',
        [horseId],
      );
      rounds.push(
        await contend(
          'SELECT 1 FROM users WHERE id = $1 FOR UPDATE',
          [newOwnerId],
          [
            () =>
              ownerships.transfer(cm, horseId, {
                newOwnerId,
                reason: 'Bán ngựa',
                version: horse.version,
              }),
            () => users.setStatus(otherCm, newOwnerId, UserStatus.INACTIVE),
          ],
        ),
      );
    }

    expect(rawErrors(rounds)).toEqual([]);
  });

  /** Môn đầu tiên trong giáo án chép của lớp */
  const classSubject = async (classId: string) => {
    const [row] = await dataSource.query<{ subject_id: string }[]>(
      `SELECT s.subject_id FROM training_class_phase_subjects s
         JOIN training_class_phases p ON p.id = s.phase_id WHERE p.class_id = $1 LIMIT 1`,
      [classId],
    );
    return row.subject_id;
  };

  /** Thân request thêm một buổi bắt đầu sau `hours` giờ, dài một giờ */
  const sessionBody = (subjectId: string, hours: number) => ({
    name: `Buổi +${hours}h`,
    subjectId,
    intensity: TrainingIntensity.LIGHT,
    plannedDistanceM: 1200,
    scheduledStartAt: new Date(Date.now() + hours * HOUR).toISOString(),
    scheduledEndAt: new Date(Date.now() + (hours + 1) * HOUR).toISOString(),
  });

  /** Ngựa đã ghi danh lớp, có một lượt PLANNED trong buổi SCHEDULED ngày mai */
  const plannedRun = async (name: string) => {
    const run = await enrolled(name);
    const sessionId = await session(run.classId, 'SCHEDULED', 24);
    const participantId = await participantOf(
      sessionId,
      run.horseId,
      run.enrollmentId,
      'PLANNED',
    );
    return { ...run, sessionId, participantId };
  };

  const assignGroomRow = (horseId: string, groomId: string) =>
    dataSource.query(
      `INSERT INTO groom_assignments (version, horse_id, groom_id, start_at)
       VALUES (1, $1, $2, now() - interval '1 day')`,
      [horseId, groomId],
    );

  it('R3-DL-N1a vet records death (horse → run → session) while the HT assigns a groom to its run (session → run): no deadlock 40P01', async () => {
    const vetId = await seed.user(UserRole.VETERINARIAN);
    const vet = await actorOf(vetId, UserRole.VETERINARIAN);
    const rounds: Outcome[][] = [];
    for (let i = 0; i < ROUNDS; i++) {
      const { horseId, participantId } = await plannedRun(`Mất ${i}`);
      const caseId = await seed.medicalCase(horseId, vetId);
      rounds.push(
        await contend(
          'SELECT 1 FROM session_participants WHERE id = $1 FOR UPDATE',
          [participantId],
          [
            () =>
              cases.closeCase(vet, caseId, {
                finalConclusion: 'Không qua khỏi',
                deceased: true,
              }),
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

  it('R3-DL-N1b CM moves a horse to another HT barn (enrollment → run → session) while the HT assigns a groom to its run (session → run): no deadlock 40P01', async () => {
    const other = await headTrainer();
    const otherBarn = await seed.barn('Khu B');
    await dataSource.query(
      'UPDATE barns SET head_trainer_id = $1 WHERE id = $2',
      [other.id, otherBarn],
    );
    const rounds: Outcome[][] = [];
    for (let i = 0; i < ROUNDS; i++) {
      await stall(otherBarn, `B-${i}`);
      const { horseId, participantId } = await plannedRun(`Chuyển ${i}`);
      rounds.push(
        await contend(
          'SELECT 1 FROM session_participants WHERE id = $1 FOR UPDATE',
          [participantId],
          [
            () =>
              placements.assignBarn(cm, horseId, {
                barnId: otherBarn,
                reason: 'Đổi khu',
              }),
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

  it('R3-DL-N1c vet records death (run → … → enrollment) while the HT takes the horse out of the class (enrollment → run): no deadlock 40P01', async () => {
    const vetId = await seed.user(UserRole.VETERINARIAN);
    const vet = await actorOf(vetId, UserRole.VETERINARIAN);
    const rounds: Outcome[][] = [];
    for (let i = 0; i < ROUNDS; i++) {
      const { horseId, enrollmentId, participantId } = await plannedRun(
        `Mất rời ${i}`,
      );
      const caseId = await seed.medicalCase(horseId, vetId);
      rounds.push(
        await contend(
          'SELECT 1 FROM session_participants WHERE id = $1 FOR UPDATE',
          [participantId],
          [
            () =>
              cases.closeCase(vet, caseId, {
                finalConclusion: 'Không qua khỏi',
                deceased: true,
              }),
            () => enrollments.leave(trainer, enrollmentId, {}),
          ],
        ),
      );
    }

    expect(rawErrors(rounds)).toEqual([]);
  });

  it('R3-DL-N2 HT cancels the class (class → session) while editing one of its sessions (session → class): no deadlock 40P01', async () => {
    const rounds: Outcome[][] = [];
    for (let i = 0; i < ROUNDS; i++) {
      const { classId, sessionId } = await plannedRun(`Sửa ${i}`);
      rounds.push(
        await contend(
          'SELECT 1 FROM training_classes WHERE id = $1 FOR UPDATE',
          [classId],
          [
            () =>
              classes.updateStatus(trainer, classId, {
                status: TrainingClassStatus.CANCELLED,
                cancelReason: 'Hết ngân sách',
              }),
            () =>
              sessions.updateSession(trainer, sessionId, {
                name: 'Đổi tên',
              }),
          ],
        ),
      );
    }

    expect(rawErrors(rounds)).toEqual([]);
  });

  it('R3-DL-N3 HT adds a session (class → HT user) while the CM hands his work over (HT user → class): no deadlock 40P01', async () => {
    const rounds: Outcome[][] = [];
    for (let i = 0; i < ROUNDS; i++) {
      const a = await headTrainer();
      const b = await headTrainer();
      const { classId } = await seed.trainingClass(a.id, {
        startDate: '2020-01-01',
        endDate: '2099-12-31',
      });
      const subjectId = await classSubject(classId);
      rounds.push(
        await contend(
          'SELECT 1 FROM training_classes WHERE id = $1 FOR UPDATE',
          [classId],
          [
            () =>
              sessions.createSession(
                a.actor,
                classId,
                sessionBody(subjectId, 48),
              ),
            () => handover.handover(cm, a.id, { toHeadTrainerId: b.id }),
          ],
        ),
      );
    }

    expect(rawErrors(rounds)).toEqual([]);
  });

  it('R3-DL-N4 HT enrolls a horse (groom user → new run, FK on session) while assigning that groom to a run of the session (session → groom user): no deadlock 40P01', async () => {
    const rounds: Outcome[][] = [];
    for (let i = 0; i < ROUNDS; i++) {
      const { classId, participantId } = await plannedRun(`Có lượt ${i}`);
      const groomId = await seed.user(UserRole.GROOM);
      const newcomer = await barnHorse(`Mới ${i}`);
      await assignGroomRow(newcomer, groomId);
      rounds.push(
        await contend(
          'SELECT 1 FROM users WHERE id = $1 FOR UPDATE',
          [groomId],
          [
            () => enrollments.create(trainer, classId, { horseId: newcomer }),
            () => participants.assignGroom(trainer, participantId, { groomId }),
          ],
        ),
      );
    }

    expect(rawErrors(rounds)).toEqual([]);
  });

  it('R3-DL-N5 HT adds two sessions (… groom user → horse of the 2nd session) while changing that horse groom (horse → groom user): no deadlock 40P01', async () => {
    const rounds: Outcome[][] = [];
    for (let i = 0; i < ROUNDS; i++) {
      const { classId, horseId } = await enrolled(`Đầu ${i}`);
      const groomId = await seed.user(UserRole.GROOM);
      await assignGroomRow(horseId, groomId);
      const late = await barnHorse(`Sau ${i}`);
      await dataSource.query(
        `INSERT INTO horse_enrollments (version, class_id, horse_id, status, enrolled_at)
         VALUES (1, $1, $2, 'ACTIVE', $3)`,
        [classId, late, new Date(Date.now() + (50 + 10 * i) * HOUR)],
      );
      const subjectId = await classSubject(classId);
      rounds.push(
        await contend(
          'SELECT 1 FROM users WHERE id = $1 FOR UPDATE',
          [groomId],
          [
            () =>
              sessions.createSessions(trainer, classId, {
                sessions: [
                  sessionBody(subjectId, 48 + 10 * i),
                  sessionBody(subjectId, 52 + 10 * i),
                ],
              }),
            () => grooms.assign(trainer, late, { groomId }),
          ],
        ),
      );
    }

    expect(rawErrors(rounds)).toEqual([]);
  });

  it('R3-DL-N7 HT cancels the class (session → run → enrollment) while taking a horse out of it (enrollment → run): no deadlock 40P01', async () => {
    const rounds: Outcome[][] = [];
    for (let i = 0; i < ROUNDS; i++) {
      const { classId, enrollmentId, sessionId } = await plannedRun(
        `Hủy rời ${i}`,
      );
      rounds.push(
        await contend(
          'SELECT 1 FROM training_sessions WHERE id = $1 FOR UPDATE',
          [sessionId],
          [
            () =>
              classes.updateStatus(trainer, classId, {
                status: TrainingClassStatus.CANCELLED,
                cancelReason: 'Hết ngân sách',
              }),
            () => enrollments.leave(trainer, enrollmentId, {}),
          ],
        ),
      );
    }

    expect(rawErrors(rounds)).toEqual([]);
  });

  it('R3-DL-N8 HT assigns the new groom to a run (session → run → groom user) while changing the horse groom to him (horse → … → run): no deadlock 40P01, the run ends with the new groom', async () => {
    const rounds: Array<{ outcomes: Outcome[]; runGroom: string | null }> = [];
    for (let i = 0; i < ROUNDS; i++) {
      const { horseId, participantId } = await plannedRun(`Đổi dắt ${i}`);
      const oldGroomId = await seed.user(UserRole.GROOM);
      const newGroomId = await seed.user(UserRole.GROOM);
      await assignGroomRow(horseId, oldGroomId);
      await dataSource.query(
        'UPDATE session_participants SET assigned_groom_id = $1 WHERE id = $2',
        [oldGroomId, participantId],
      );
      const outcomes = await contend(
        'SELECT 1 FROM session_participants WHERE id = $1 FOR UPDATE',
        [participantId],
        [
          () =>
            participants.assignGroom(trainer, participantId, {
              groomId: newGroomId,
            }),
          () => grooms.assign(trainer, horseId, { groomId: newGroomId }),
        ],
      );
      const [row] = await dataSource.query<
        { assigned_groom_id: string | null }[]
      >('SELECT assigned_groom_id FROM session_participants WHERE id = $1', [
        participantId,
      ]);
      rounds.push({
        outcomes,
        runGroom: row.assigned_groom_id === newGroomId ? 'new' : 'other',
      });
    }

    expect(rawErrors(rounds.map((round) => round.outcomes))).toEqual([]);
    expect(rounds.map((round) => round.runGroom)).toEqual(
      Array(ROUNDS).fill('new'),
    );
  });

  it('R3-4b CM deactivates a head trainer while he creates a training plan: one refused (403 inactive caller or 409 plan exists), never a plan of an inactive HT', async () => {
    const [subject] = await dataSource.query<{ id: string }[]>(
      `INSERT INTO training_subjects (version, name, session_type, intensity, planned_distance_m)
       VALUES (1, 'Phi nước kiệu', 'REGULAR', 'LIGHT', 1200) RETURNING id`,
    );
    const rounds: Array<{ outcomes: string[]; inactiveOwner: number }> = [];
    for (let i = 0; i < ROUNDS; i++) {
      const ht = await headTrainer();
      const outcomes = await contend(
        'SELECT 1 FROM users WHERE id = $1 FOR UPDATE',
        [ht.id],
        [
          () => users.setStatus(cm, ht.id, UserStatus.INACTIVE),
          () =>
            plans.create(ht.actor, {
              name: `Giáo án ${i}`,
              phases: [
                {
                  weeks: 4,
                  subjects: [{ subjectId: subject.id, minSessionsPerWeek: 3 }],
                },
              ],
            }),
        ],
      );
      const [row] = await dataSource.query<{ n: number }[]>(
        `SELECT count(*)::int AS n FROM training_plans p JOIN users u ON u.id = p.head_trainer_id
          WHERE u.id = $1 AND u.status <> 'ACTIVE'`,
        [ht.id],
      );
      rounds.push({
        outcomes: sorted(
          outcomes.map((o) => (o === 403 || o === 409 ? 'refused' : o)),
        ),
        inactiveOwner: row.n,
      });
    }

    expect(rounds).toEqual(
      Array(ROUNDS).fill({ outcomes: ['ok', 'refused'], inactiveOwner: 0 }),
    );
  });

  it('R3-4c CM deactivates a head trainer while he creates a class: one 409, never an active class of an inactive HT', async () => {
    const rounds: Array<{ outcomes: string[]; inactiveOwner: number }> = [];
    for (let i = 0; i < ROUNDS; i++) {
      const ht = await headTrainer();
      const { planId, classId } = await seed.trainingClass(ht.id, {
        weeks: 4,
      });
      await dataSource.query('DELETE FROM training_classes WHERE id = $1', [
        classId,
      ]);
      const outcomes = await contend(
        'SELECT 1 FROM users WHERE id = $1 FOR UPDATE',
        [ht.id],
        [
          () => users.setStatus(cm, ht.id, UserStatus.INACTIVE),
          () =>
            classes.create(ht.actor, {
              code: `HT-${i}`,
              name: `Lớp HT ${i}`,
              planId,
              startDate: '2026-11-02',
            }),
        ],
      );
      const [row] = await dataSource.query<{ n: number }[]>(
        `SELECT count(*)::int AS n FROM training_classes c JOIN users u ON u.id = c.head_trainer_id
          WHERE u.id = $1 AND u.status <> 'ACTIVE' AND c.status = 'ACTIVE'`,
        [ht.id],
      );
      rounds.push({ outcomes: sorted(outcomes), inactiveOwner: row.n });
    }

    expect(rounds).toEqual(
      Array(ROUNDS).fill({ outcomes: ['409', 'ok'], inactiveOwner: 0 }),
    );
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

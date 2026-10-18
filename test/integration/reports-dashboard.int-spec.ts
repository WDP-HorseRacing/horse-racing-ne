import { BadRequestException } from '@nestjs/common';
import { Types, type Model } from 'mongoose';
import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { UserRole } from '../../src/common/enums/role.enum';
import type { Actor } from '../../src/common/types/actor';
import {
  HorseHealthStatus,
  HorseLifecycleStatus,
} from '../../src/modules/horses/enums/horse-status.enum';
import {
  PerformanceMetric,
  PerformanceMetricSchema,
} from '../../src/modules/performance/schemas/performance-metric.schema';
import { DashboardRepository } from '../../src/modules/reports/dashboard/dashboard.repository';
import { DashboardService } from '../../src/modules/reports/dashboard/dashboard.service';
import { ReportsAccessService } from '../../src/modules/reports/shared/reports-access.service';
import { fixtures } from './fixtures';
import {
  clearAllMongoCollections,
  startTestMongo,
  stopTestMongo,
  type TestMongo,
} from './mongo';
import {
  startTestPostgres,
  stopTestPostgres,
  truncateAllTables,
  type TestPostgres,
} from './postgres';

describe('Reports dashboard (Postgres + MongoDB)', () => {
  let db: TestPostgres;
  let mongo: TestMongo;
  let metrics: Model<PerformanceMetric>;
  let dataSource: DataSource;
  let seed: ReturnType<typeof fixtures>;
  let service: DashboardService;
  let manager: Actor;
  let trainer: Actor;
  let trainerId: string;
  let classId: string;
  let barnA: string;
  let barnB: string;
  let gio: string;
  let may: string;
  let sao: string;

  beforeAll(async () => {
    db = await startTestPostgres();
    dataSource = db.dataSource;
    seed = fixtures(dataSource);
    mongo = await startTestMongo();
    metrics = mongo.connection.model(
      PerformanceMetric.name,
      PerformanceMetricSchema,
    );
    await metrics.init();
    service = new DashboardService(
      new DashboardRepository(dataSource),
      new ReportsAccessService(metrics),
      dataSource,
    );
  });

  afterAll(async () => {
    await stopTestMongo(mongo);
    await stopTestPostgres(db);
  });

  const actorOf = async (id: string, role: UserRole): Promise<Actor> => {
    const [row] = await dataSource.query<Array<{ keycloak_id: string }>>(
      'SELECT keycloak_id FROM users WHERE id = $1',
      [id],
    );
    return { sub: row.keycloak_id, roles: [role] };
  };

  const enroll = async (horseId: string): Promise<string> => {
    const id = randomUUID();
    await dataSource.query(
      `INSERT INTO horse_enrollments (id, version, class_id, horse_id, status, enrolled_at)
       VALUES ($1, 1, $2, $3, 'ACTIVE', '2026-01-02T00:00:00Z')`,
      [id, classId, horseId],
    );
    return id;
  };

  const session = async (startAt: string, intensity: string) => {
    const id = randomUUID();
    await dataSource.query(
      `INSERT INTO training_sessions (id, version, class_id, name, scheduled_start_at, scheduled_end_at, status, intensity, planned_distance_m)
       VALUES ($1, 1, $2, 'Buổi', $3::timestamptz, $3::timestamptz + interval '1 hour', 'COMPLETED', $4, 3000)`,
      [id, classId, startAt, intensity],
    );
    return id;
  };

  const run = async (
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

  const point = (
    horseId: string,
    at: string,
    heartRate: number,
    speed: string,
    level = 'NORMAL',
  ) =>
    metrics.create({
      recordedAt: new Date(at),
      meta: {
        horseId,
        sessionParticipantId: randomUUID(),
        sessionId: randomUUID(),
        sourceId: 'sensor-1',
      },
      heartRateBpm: heartRate,
      speedMps: Types.Decimal128.fromString(speed),
      alertLevel: level,
    });

  const weigh = (horseId: string, value: number, at: string, deleted = false) =>
    dataSource.query(
      `INSERT INTO horse_measurements (horse_id, type, value, measured_at, measured_by, deleted_at)
       VALUES ($1, 'WEIGHT', $2, $3, $4, $5)`,
      [horseId, value, at, trainerId, deleted ? new Date() : null],
    );

  beforeEach(async () => {
    await truncateAllTables(dataSource);
    await clearAllMongoCollections(mongo.connection);
    manager = await actorOf(
      await seed.user(UserRole.CLUB_MANAGER),
      UserRole.CLUB_MANAGER,
    );
    trainerId = await seed.user(UserRole.HEAD_TRAINER);
    trainer = await actorOf(trainerId, UserRole.HEAD_TRAINER);
    const otherTrainer = await seed.user(UserRole.HEAD_TRAINER);
    barnA = await seed.barn('Khu A');
    barnB = await seed.barn('Khu B');
    await dataSource.query(
      'UPDATE barns SET head_trainer_id = $1 WHERE id = $2',
      [trainerId, barnA],
    );
    await dataSource.query(
      'UPDATE barns SET head_trainer_id = $1 WHERE id = $2',
      [otherTrainer, barnB],
    );
    ({ classId } = await seed.trainingClass(trainerId, {
      startDate: '2026-01-01',
      endDate: '2026-12-31',
    }));
    gio = await seed.horse('Gió', { barnId: barnA });
    may = await seed.horse('Mây', {
      barnId: barnA,
      health: HorseHealthStatus.INJURED,
    });
    sao = await seed.horse('Sao', { barnId: barnB });
    await seed.horse('Đã giải nghệ', {
      barnId: barnA,
      lifecycle: HorseLifecycleStatus.RETIRED,
    });
    await seed.horse('Đã xóa', { barnId: barnA, deleted: true });
    await dataSource.query(
      `INSERT INTO training_locks (id, version, horse_id, locked_by, reason, lock_start, status)
       VALUES ($1, 1, $2, $3, 'Nghỉ', now(), 'ACTIVE')`,
      [randomUUID(), may, trainerId],
    );
    await weigh(gio, 470, '2026-09-01T00:00:00Z');
    await weigh(gio, 480, '2026-10-01T00:00:00Z');
    await weigh(gio, 999, '2026-10-02T00:00:00Z', true);

    const gioEnrollment = await enroll(gio);
    const mayEnrollment = await enroll(may);
    const saoEnrollment = await enroll(sao);
    const week1 = await session('2026-10-05T01:00:00Z', 'HEAVY');
    await run(week1, gio, gioEnrollment, 'COMPLETED');
    await run(week1, may, mayEnrollment, 'CANCELLED_BY_LOCK');
    const week2 = await session('2026-10-12T01:00:00Z', 'LIGHT');
    await run(week2, gio, gioEnrollment, 'COMPLETED');
    await run(week2, sao, saoEnrollment, 'ABSENT');
    const before = await session('2026-09-01T01:00:00Z', 'HEAVY');
    await run(before, gio, gioEnrollment, 'COMPLETED');

    await point(gio, '2026-10-05T01:10:00Z', 150, '14.000');
    await point(gio, '2026-10-05T01:20:00Z', 170, '15.000', 'WARNING');
    await point(gio, '2026-10-12T01:10:00Z', 160, '16.000');
    await point(gio, '2026-09-01T01:10:00Z', 200, '20.000', 'CRITICAL');
  });

  const period = { from: '2026-10-01', to: '2026-10-14' };

  const dashboardHorseId = async (name: string) => {
    const [row] = await dataSource.query<Array<{ id: string }>>(
      'SELECT id FROM horses WHERE name = $1',
      [name],
    );
    return row.id;
  };

  it('sums the herd, the training, the weekly chart and each horse over the whole club', async () => {
    const dashboard = await service.get(manager, period);

    expect(dashboard).toMatchObject({
      from: '2026-10-01',
      to: '2026-10-14',
      herd: {
        total: 3,
        byHealthStatus: {
          ELIGIBLE: 2,
          UNDER_OBSERVATION: 0,
          INJURED: 1,
          QUARANTINED: 0,
        },
        trainingLocked: 1,
      },
      training: {
        sessions: 2,
        completed: 2,
        absent: 1,
        ineligible: 1,
        completedByIntensity: { LIGHT: 1, HEAVY: 1 },
      },
      weekly: [
        {
          weekStart: '2026-10-05',
          completed: 1,
          avgHeartRateBpm: 160,
          avgSpeedMps: 14.5,
          alertCount: 1,
        },
        {
          weekStart: '2026-10-12',
          completed: 1,
          avgHeartRateBpm: 160,
          avgSpeedMps: 16,
          alertCount: 0,
        },
      ],
    });
    expect(dashboard.horses.map((horse) => horse.horseName)).toEqual([
      'Gió',
      'Mây',
      'Sao',
    ]);
    expect(dashboard.horses[0]).toEqual({
      horseId: gio,
      horseName: 'Gió',
      barnId: barnA,
      barnName: 'Khu A',
      healthStatus: HorseHealthStatus.ELIGIBLE,
      trainingLocked: false,
      completed: 2,
      avgHeartRateBpm: 160,
      maxHeartRateBpm: 170,
      avgSpeedMps: 15,
      maxSpeedMps: 16,
      alertCount: 1,
      latestWeightKg: 480,
    });
    expect(dashboard.horses[2]).toMatchObject({
      horseName: 'Sao',
      completed: 0,
      avgHeartRateBpm: null,
      alertCount: 0,
      latestWeightKg: null,
    });
  });

  it('counts stopped runs apart from completed ones, in totals and the weekly chart', async () => {
    const saoId = dashboardHorseId('Sao');
    const [{ id: enrollmentId }] = await dataSource.query<
      Array<{ id: string }>
    >('SELECT id FROM horse_enrollments WHERE horse_id = $1', [await saoId]);
    await run(
      await session('2026-10-13T03:00:00Z', 'LIGHT'),
      await saoId,
      enrollmentId,
      'STOPPED',
    );

    const dashboard = await service.get(manager, period);

    expect(dashboard.training).toMatchObject({
      completed: 2,
      stopped: 1,
      completedByIntensity: { LIGHT: 1, HEAVY: 1 },
    });
    expect(
      dashboard.weekly.map(({ weekStart, completed, stopped }) => ({
        weekStart,
        completed,
        stopped,
      })),
    ).toEqual([
      { weekStart: '2026-10-05', completed: 1, stopped: 0 },
      { weekStart: '2026-10-12', completed: 1, stopped: 1 },
    ]);
  });

  it('narrows to the barns of the caller or to one barn', async () => {
    const mine = await service.get(trainer, { ...period, mine: true });
    const barn = await service.get(manager, { ...period, barnId: barnB });

    expect(mine.horses.map((horse) => horse.horseName)).toEqual(['Gió', 'Mây']);
    expect(mine.training).toMatchObject({ completed: 2, absent: 0 });
    expect(barn.horses.map((horse) => horse.horseName)).toEqual(['Sao']);
    expect(barn.training).toMatchObject({
      sessions: 1,
      completed: 0,
      absent: 1,
    });
    expect(barn.weekly).toEqual([]);
  });

  it('rejects a start after the end', async () => {
    await expect(
      service.get(manager, { from: '2026-10-14', to: '2026-10-01' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

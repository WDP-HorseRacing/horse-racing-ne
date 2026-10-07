import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Types, type Model } from 'mongoose';
import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { UserRole } from '../../src/common/enums/role.enum';
import type { Actor } from '../../src/common/types/actor';
import { HorseAccessService } from '../../src/modules/horses/shared/horse-access.service';
import { PerformanceDetailsRepository } from '../../src/modules/performance/performance-details/performance-details.repository';
import { PerformanceDetailsService } from '../../src/modules/performance/performance-details/performance-details.service';
import {
  PerformanceMetric,
  PerformanceMetricSchema,
} from '../../src/modules/performance/schemas/performance-metric.schema';
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

describe('PerformanceDetailsService.workload (Postgres + MongoDB)', () => {
  let db: TestPostgres;
  let mongo: TestMongo;
  let metrics: Model<PerformanceMetric>;
  let dataSource: DataSource;
  let seed: ReturnType<typeof fixtures>;
  let service: PerformanceDetailsService;
  let manager: Actor;
  let horseId: string;
  let classId: string;
  let enrollmentId: string;

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
    service = new PerformanceDetailsService(
      new PerformanceDetailsRepository(metrics, dataSource),
      new HorseAccessService(dataSource),
    );
  });

  afterAll(async () => {
    await stopTestMongo(mongo);
    await stopTestPostgres(db);
  });

  beforeEach(async () => {
    await truncateAllTables(dataSource);
    await clearAllMongoCollections(mongo.connection);
    const managerId = await seed.user(UserRole.CLUB_MANAGER);
    const [row] = await dataSource.query<Array<{ keycloak_id: string }>>(
      'SELECT keycloak_id FROM users WHERE id = $1',
      [managerId],
    );
    manager = { sub: row.keycloak_id, roles: [UserRole.CLUB_MANAGER] };
    const trainer = await seed.user(UserRole.HEAD_TRAINER);
    ({ classId } = await seed.trainingClass(trainer, {
      startDate: '2026-01-01',
      endDate: '2026-12-31',
    }));
    horseId = await seed.horse('Winx');
    enrollmentId = randomUUID();
    await dataSource.query(
      `INSERT INTO horse_enrollments (id, version, class_id, horse_id, status, enrolled_at)
       VALUES ($1, 1, $2, $3, 'ACTIVE', '2026-01-02T00:00:00Z')`,
      [enrollmentId, classId, horseId],
    );
  });

  const participant = async (
    startAt: string,
    options: {
      intensity: string;
      distance: number;
      status?: string;
      minutes?: number;
    },
  ): Promise<string> => {
    const sessionId = randomUUID();
    await dataSource.query(
      `INSERT INTO training_sessions (id, version, class_id, name, scheduled_start_at, scheduled_end_at, status, intensity, planned_distance_m)
       VALUES ($1, 1, $2, 'Buổi', $3::timestamptz, $3::timestamptz + interval '1 hour', 'COMPLETED', $4, $5)`,
      [sessionId, classId, startAt, options.intensity, options.distance],
    );
    const id = randomUUID();
    await dataSource.query(
      `INSERT INTO session_participants (id, version, session_id, horse_id, horse_enrollment_id, status, started_at, completed_at)
       VALUES ($1, 1, $2, $3, $4, $5, $6::timestamptz, $6::timestamptz + make_interval(mins => $7))`,
      [
        id,
        sessionId,
        horseId,
        enrollmentId,
        options.status ?? 'COMPLETED',
        startAt,
        options.minutes ?? 30,
      ],
    );
    return id;
  };

  const point = (participantId: string, at: string, speed: string) =>
    metrics.create({
      recordedAt: new Date(at),
      meta: {
        horseId,
        sessionParticipantId: participantId,
        sessionId: randomUUID(),
        sourceId: 'sensor-1',
      },
      heartRateBpm: 150,
      speedMps: Types.Decimal128.fromString(speed),
    });

  it('sums completed participants in the range by intensity, planned distance, duration and sensor distance', async () => {
    const heavy = await participant('2026-10-05T01:00:00Z', {
      intensity: 'HEAVY',
      distance: 3000,
      minutes: 30,
    });
    await participant('2026-10-06T01:00:00Z', {
      intensity: 'LIGHT',
      distance: 2000,
      minutes: 20,
    });
    await participant('2026-10-07T01:00:00Z', {
      intensity: 'HEAVY',
      distance: 4000,
      status: 'ONGOING',
    });
    await participant('2026-10-20T01:00:00Z', {
      intensity: 'MODERATE',
      distance: 5000,
    });
    await point(heavy, '2026-10-05T01:00:00Z', '10');
    await point(heavy, '2026-10-05T01:00:01Z', '10');
    await point(heavy, '2026-10-05T01:00:02Z', '12');
    await point(heavy, '2026-10-05T01:00:40Z', '10');

    const result = await service.workload(manager, horseId, {
      from: '2026-10-05',
      to: '2026-10-11',
    });

    expect(result).toEqual({
      horseId,
      from: '2026-10-05',
      to: '2026-10-11',
      sessionsCompleted: 2,
      byIntensity: { LIGHT: 1, MODERATE: 0, HEAVY: 1 },
      plannedDistanceM: 5000,
      actualDurationSeconds: 3000,
      actualDistanceM: 72,
    });
  });

  it('defaults to the last seven club days', async () => {
    const result = await service.workload(manager, horseId, {});

    const days =
      (new Date(result.to).getTime() - new Date(result.from).getTime()) /
      86_400_000;
    expect(days).toBe(6);
    expect(result.sessionsCompleted).toBe(0);
    expect(result.actualDistanceM).toBe(0);
  });

  it('rejects a range that ends before it starts', async () => {
    await expect(
      service.workload(manager, horseId, {
        from: '2026-10-11',
        to: '2026-10-05',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('hides a horse the caller cannot read', async () => {
    const ownerId = await seed.user(UserRole.HORSE_OWNER);
    const [row] = await dataSource.query<Array<{ keycloak_id: string }>>(
      'SELECT keycloak_id FROM users WHERE id = $1',
      [ownerId],
    );

    await expect(
      service.workload(
        { sub: row.keycloak_id, roles: [UserRole.HORSE_OWNER] },
        horseId,
        {},
      ),
    ).rejects.toThrow(NotFoundException);
  });
});

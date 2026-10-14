import { NotFoundException } from '@nestjs/common';
import { Types, type Model } from 'mongoose';
import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { UserRole } from '../../src/common/enums/role.enum';
import type { Actor } from '../../src/common/types/actor';
import { HorseHealthStatus } from '../../src/modules/horses/enums/horse-status.enum';
import { HorseAccessService } from '../../src/modules/horses/shared/horse-access.service';
import { MedicalCaseStatus } from '../../src/modules/medical/constants/medical-case.enum';
import {
  PerformanceMetric,
  PerformanceMetricSchema,
} from '../../src/modules/performance/schemas/performance-metric.schema';
import { HorseReportsRepository } from '../../src/modules/reports/horse-reports/horse-reports.repository';
import { HorseReportsService } from '../../src/modules/reports/horse-reports/horse-reports.service';
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

describe('Reports per horse (Postgres + MongoDB)', () => {
  let db: TestPostgres;
  let mongo: TestMongo;
  let metrics: Model<PerformanceMetric>;
  let dataSource: DataSource;
  let seed: ReturnType<typeof fixtures>;
  let service: HorseReportsService;
  let manager: Actor;
  let owner: Actor;
  let otherOwner: Actor;
  let staffId: string;
  let classId: string;
  let gio: string;

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
    service = new HorseReportsService(
      new HorseReportsRepository(dataSource),
      new HorseAccessService(dataSource),
      new ReportsAccessService(metrics),
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

  const session = async (
    startAt: string,
    intensity: string,
    distance: number,
  ) => {
    const id = randomUUID();
    await dataSource.query(
      `INSERT INTO training_sessions (id, version, class_id, name, scheduled_start_at, scheduled_end_at, status, intensity, planned_distance_m)
       VALUES ($1, 1, $2, $5, $3::timestamptz, $3::timestamptz + interval '1 hour', 'COMPLETED', $4, $6)`,
      [
        id,
        classId,
        startAt,
        intensity,
        `Buổi ${startAt.slice(5, 10)}`,
        distance,
      ],
    );
    return id;
  };

  const run = async (
    sessionId: string,
    enrollmentId: string,
    status: string,
    startedAt: string | null = null,
    completedAt: string | null = null,
  ) => {
    const id = randomUUID();
    await dataSource.query(
      `INSERT INTO session_participants (id, version, session_id, horse_id, horse_enrollment_id, status, started_at, completed_at)
       VALUES ($1, 1, $2, $3, $4, $5, $6, $7)`,
      [id, sessionId, gio, enrollmentId, status, startedAt, completedAt],
    );
    return id;
  };

  const point = (
    participantId: string,
    at: string,
    heartRate: number,
    speed: string,
    level = 'NORMAL',
  ) =>
    metrics.create({
      recordedAt: new Date(at),
      meta: {
        horseId: gio,
        sessionParticipantId: participantId,
        sessionId: randomUUID(),
        sourceId: 'sensor-1',
      },
      heartRateBpm: heartRate,
      speedMps: Types.Decimal128.fromString(speed),
      alertLevel: level,
    });

  let heavy: string;
  let light: string;

  beforeEach(async () => {
    await truncateAllTables(dataSource);
    await clearAllMongoCollections(mongo.connection);
    manager = await actorOf(
      await seed.user(UserRole.CLUB_MANAGER),
      UserRole.CLUB_MANAGER,
    );
    const ownerId = await seed.user(UserRole.HORSE_OWNER);
    owner = await actorOf(ownerId, UserRole.HORSE_OWNER);
    otherOwner = await actorOf(
      await seed.user(UserRole.HORSE_OWNER),
      UserRole.HORSE_OWNER,
    );
    staffId = await seed.user(UserRole.HEAD_TRAINER);
    ({ classId } = await seed.trainingClass(staffId, {
      startDate: '2026-01-01',
      endDate: '2026-12-31',
    }));
    gio = await seed.horse('Gió', {
      ownerId,
      health: HorseHealthStatus.UNDER_OBSERVATION,
    });
    const enrollmentId = randomUUID();
    await dataSource.query(
      `INSERT INTO horse_enrollments (id, version, class_id, horse_id, status, enrolled_at)
       VALUES ($1, 1, $2, $3, 'ACTIVE', '2026-01-02T00:00:00Z')`,
      [enrollmentId, classId, gio],
    );

    const week1 = await session('2026-10-05T01:00:00Z', 'HEAVY', 3000);
    heavy = await run(
      week1,
      enrollmentId,
      'COMPLETED',
      '2026-10-05T01:00:00Z',
      '2026-10-05T01:45:00Z',
    );
    const week2 = await session('2026-10-12T01:00:00Z', 'LIGHT', 1200);
    light = await run(
      week2,
      enrollmentId,
      'COMPLETED',
      '2026-10-12T01:00:00Z',
      '2026-10-12T01:20:00Z',
    );
    await run(
      await session('2026-10-13T01:00:00Z', 'MODERATE', 2000),
      enrollmentId,
      'CANCELLED_BY_LOCK',
    );
    await run(
      await session('2026-10-08T01:00:00Z', 'MODERATE', 2000),
      enrollmentId,
      'ABSENT',
    );
    const before = await run(
      await session('2026-09-01T01:00:00Z', 'HEAVY', 5000),
      enrollmentId,
      'COMPLETED',
      '2026-09-01T01:00:00Z',
      '2026-09-01T02:00:00Z',
    );

    await dataSource.query(
      `INSERT INTO performance_evaluations (id, version, evaluator_id, score, comment, session_participant_id)
       VALUES ($1, 1, $2, 8, 'Ổn', $3)`,
      [randomUUID(), staffId, heavy],
    );
    const timeTrial = randomUUID();
    await dataSource.query(
      `INSERT INTO time_trials (id, version, session_id, distance_m) VALUES ($1, 1, $2, 1200)`,
      [timeTrial, week2],
    );
    for (const [attemptNo, ms] of [
      [1, '75000'],
      [2, '72000'],
    ] as const) {
      await dataSource.query(
        `INSERT INTO trial_results (id, version, time_trial_id, session_participant_id, attempt_no, elapsed_ms, recorded_by, recorded_at)
         VALUES ($1, 1, $2, $3, $4, $5, $6, '2026-10-12T01:30:00Z')`,
        [randomUUID(), timeTrial, light, attemptNo, ms, staffId],
      );
    }

    await point(heavy, '2026-10-05T01:10:00Z', 150, '14.000');
    await point(heavy, '2026-10-05T01:20:00Z', 170, '15.000', 'WARNING');
    await point(light, '2026-10-12T01:10:00Z', 160, '16.000');
    await point(before, '2026-09-01T01:10:00Z', 200, '20.000', 'CRITICAL');
  });

  const period = { from: '2026-10-01', to: '2026-10-14' };

  it('reports the totals, the weekly chart and each run of the period', async () => {
    const report = await service.progress(owner, gio, period);

    expect(report).toMatchObject({
      horseId: gio,
      horseName: 'Gió',
      from: '2026-10-01',
      to: '2026-10-14',
      totals: {
        completed: 2,
        absent: 1,
        ineligible: 1,
        plannedDistanceM: 4200,
        trainedMinutes: 65,
        completedByIntensity: { LIGHT: 1, MODERATE: 0, HEAVY: 1 },
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
    expect(report.sessions.map((row) => row.status)).toEqual([
      'COMPLETED',
      'ABSENT',
      'COMPLETED',
      'CANCELLED_BY_LOCK',
    ]);
    expect(report.sessions[0]).toMatchObject({
      participantId: heavy,
      sessionName: 'Buổi 10-05',
      intensity: 'HEAVY',
      plannedDistanceM: 3000,
      avgHeartRateBpm: 160,
      maxHeartRateBpm: 170,
      avgSpeedMps: 14.5,
      maxSpeedMps: 15,
      alertCount: 1,
      evaluation: { score: 8, comment: 'Ổn' },
      bestTrialMs: null,
    });
    expect(report.sessions[2]).toMatchObject({
      participantId: light,
      evaluation: null,
      bestTrialMs: 72000,
    });
    expect(report.sessions[1]).toMatchObject({
      avgHeartRateBpm: null,
      alertCount: 0,
    });
  });

  it('reports status changes, measurements, cases, injuries and locks overlapping the period', async () => {
    await seed.horseAudit(
      gio,
      { healthStatus: 'ELIGIBLE' },
      { healthStatus: 'UNDER_OBSERVATION' },
      '2026-10-03T00:00:00Z',
      { reason: 'Đi khập khiễng' },
    );
    await seed.horseAudit(
      gio,
      { healthStatus: 'ELIGIBLE' },
      { healthStatus: 'INJURED' },
      '2026-09-20T00:00:00Z',
    );
    await seed.horseAudit(
      gio,
      { healthStatus: 'UNDER_OBSERVATION', name: 'A' },
      { healthStatus: 'UNDER_OBSERVATION', name: 'B' },
      '2026-10-04T00:00:00Z',
    );
    const measure = (value: number, at: string, deleted = false) =>
      dataSource.query(
        `INSERT INTO horse_measurements (horse_id, type, value, measured_at, measured_by, deleted_at)
         VALUES ($1, 'WEIGHT', $2, $3, $4, $5)`,
        [gio, value, at, staffId, deleted ? new Date() : null],
      );
    await measure(480, '2026-10-02T00:00:00Z');
    await measure(999, '2026-10-03T00:00:00Z', true);
    await measure(470, '2026-09-02T00:00:00Z');
    const closedBefore = await seed.medicalCase(gio, staffId, {
      status: MedicalCaseStatus.CLOSED,
      openedAt: '2026-09-01T00:00:00Z',
      closedAt: '2026-09-10T00:00:00Z',
    });
    const spanning = await seed.medicalCase(gio, staffId, {
      status: MedicalCaseStatus.CLOSED,
      openedAt: '2026-09-25T00:00:00Z',
      closedAt: '2026-10-02T00:00:00Z',
    });
    const open = await seed.medicalCase(gio, staffId, {
      openedAt: '2026-10-03T00:00:00Z',
    });
    const injure = async (examDate: string, voided: boolean, type: string) => {
      const recordId = await seed.visit(gio, staffId, examDate, { voided });
      await dataSource.query(
        `INSERT INTO injury_markers (medical_record_id, body_region, injury_type, recovery_status)
         VALUES ($1, 'LEFT_FRONT_LEG', $2, 'ACUTE')`,
        [recordId, type],
      );
    };
    await injure('2026-10-03T02:00:00Z', false, 'SPRAIN');
    await injure('2026-10-03T03:00:00Z', true, 'FRACTURE');
    await injure('2026-09-03T02:00:00Z', false, 'WOUND');
    const lock = (start: string, status: string, releasedAt: string | null) =>
      dataSource.query<Array<{ id: string }>>(
        `INSERT INTO training_locks (id, version, horse_id, locked_by, reason, lock_start, lock_end, status, released_at, released_by)
         VALUES ($1, 1, $2, $3, 'Nghỉ', $4, '2026-09-05T00:00:00Z', $5, $6, $7) RETURNING id`,
        [
          randomUUID(),
          gio,
          staffId,
          start,
          status,
          releasedAt,
          releasedAt ? staffId : null,
        ],
      );
    await lock('2026-09-01T00:00:00Z', 'RELEASED', '2026-09-15T00:00:00Z');
    const [released] = await lock(
      '2026-09-20T00:00:00Z',
      'RELEASED',
      '2026-10-01T05:00:00Z',
    );
    const [active] = await lock('2026-09-01T00:00:00Z', 'ACTIVE', null);

    const report = await service.health(manager, gio, period);

    expect(report).toMatchObject({
      horseId: gio,
      currentHealthStatus: HorseHealthStatus.UNDER_OBSERVATION,
      statusChanges: [
        {
          from: 'ELIGIBLE',
          to: 'UNDER_OBSERVATION',
          reason: 'Đi khập khiễng',
        },
      ],
      measurements: [{ type: 'WEIGHT', value: 480, isAbnormal: false }],
      injuries: [
        {
          bodyRegion: 'LEFT_FRONT_LEG',
          injuryType: 'SPRAIN',
          recoveryStatus: 'ACUTE',
        },
      ],
    });
    expect(report.medicalCases.map((row) => row.caseId)).toEqual([
      spanning,
      open,
    ]);
    expect(report.medicalCases).not.toContainEqual(
      expect.objectContaining({ caseId: closedBefore }),
    );
    expect(report.trainingLocks.map((row) => row.lockId).sort()).toEqual(
      [released.id, active.id].sort(),
    );
  });

  it('hides the horse from an owner who does not own it', async () => {
    await expect(
      service.progress(otherOwner, gio, period),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      service.health(otherOwner, gio, period),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

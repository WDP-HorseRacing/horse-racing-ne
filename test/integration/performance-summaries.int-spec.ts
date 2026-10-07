import { Types, type Model } from 'mongoose';
import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { UserRole } from '../../src/common/enums/role.enum';
import {
  toHorsePerformanceResponse,
  toSessionPerformanceSummary,
} from '../../src/modules/performance/mappers/performance.mapper';
import { PerformanceEvaluationEntity } from '../../src/modules/performance/entities/performance-evaluation.entity';
import { PerformanceSummariesRepository } from '../../src/modules/performance/performance-summaries/performance-summaries.repository';
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

describe('PerformanceSummariesRepository (Postgres + MongoDB time-series)', () => {
  let db: TestPostgres;
  let mongo: TestMongo;
  let metrics: Model<PerformanceMetric>;
  let dataSource: DataSource;
  let seed: ReturnType<typeof fixtures>;
  let repository: PerformanceSummariesRepository;

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
    repository = new PerformanceSummariesRepository(
      metrics,
      dataSource.getRepository(PerformanceEvaluationEntity),
      dataSource,
    );
  });

  afterAll(async () => {
    await stopTestMongo(mongo);
    await stopTestPostgres(db);
  });

  beforeEach(async () => {
    await truncateAllTables(dataSource);
    await clearAllMongoCollections(mongo.connection);
  });

  /**
   * Tạo lớp, giáo án và ghi danh cho một con ngựa, trả về hàm tạo lượt tập theo giờ bắt đầu
   */
  const enrolledHorse = async (name: string) => {
    const trainer = await seed.user(UserRole.HEAD_TRAINER);
    const horseId = await seed.horse(name);
    const classId = randomUUID();
    await dataSource.query(
      `INSERT INTO training_classes (id, version, name, code, head_trainer_id, start_date, end_date, status)
       VALUES ($1, 1, $2, $3, $4, '2026-09-01', '2026-12-31', 'ACTIVE')`,
      [classId, `Lớp ${name}`, classId.slice(0, 8), trainer],
    );
    const enrollmentId = randomUUID();
    await dataSource.query(
      `INSERT INTO horse_enrollments (id, version, class_id, horse_id, status, enrolled_at)
       VALUES ($1, 1, $2, $3, 'ACTIVE', '2026-09-05T00:00:00Z')`,
      [enrollmentId, classId, horseId],
    );
    const planId = randomUUID();
    await dataSource.query(
      `INSERT INTO training_plans (id, version, class_id, created_by, name, phase_name, goal, start_date, end_date)
       VALUES ($1, 1, $2, $3, 'Giáo án', 'Nền tảng', 'Mục tiêu', '2026-09-01', '2026-12-31')`,
      [planId, classId, trainer],
    );

    const participant = async (scheduledAt: string) => {
      const sessionId = randomUUID();
      await dataSource.query(
        `INSERT INTO training_sessions (id, version, plan_id, name, scheduled_start_at, scheduled_end_at, intensity, planned_distance_m, class_id)
         VALUES ($1, 1, $2, 'Buổi', $3::timestamptz, $3::timestamptz + interval '1 hour', 'MODERATE', 3000, (SELECT class_id FROM training_plans WHERE id = $2))`,
        [sessionId, planId, scheduledAt],
      );
      const participantId = randomUUID();
      await dataSource.query(
        `INSERT INTO session_participants (id, version, session_id, horse_id, horse_enrollment_id, status)
         VALUES ($1, 1, $2, $3, $4, 'COMPLETED')`,
        [participantId, sessionId, horseId, enrollmentId],
      );
      return { sessionId, participantId, horseId };
    };

    return { horseId, participant };
  };

  const metric = (
    participant: { participantId: string; sessionId: string; horseId: string },
    recordedAt: string,
    heartRateBpm: number,
    speedMps: string,
    alertLevel = 'NORMAL',
  ) =>
    metrics.create({
      recordedAt: new Date(recordedAt),
      meta: {
        horseId: participant.horseId,
        sessionParticipantId: participant.participantId,
        sessionId: participant.sessionId,
        sourceId: 'sensor-1',
      },
      heartRateBpm,
      speedMps: Types.Decimal128.fromString(speedMps),
      alertLevel,
    });

  it('stores metrics in a time-series collection keyed by recordedAt and meta', async () => {
    const [info] = await mongo.connection
      .db!.listCollections({ name: 'performance_metrics' })
      .toArray();

    expect(info).toMatchObject({
      type: 'timeseries',
      options: {
        timeseries: {
          timeField: 'recordedAt',
          metaField: 'meta',
          granularity: 'seconds',
        },
      },
    });
  });

  describe('sessionSummaries', () => {
    it('aggregates each session of the horse, newest session first, with rounding and alert count', async () => {
      const winx = await enrolledHorse('Winx');
      const other = await enrolledHorse('Gió');
      const older = await winx.participant('2026-10-01T01:00:00Z');
      const newer = await winx.participant('2026-10-03T01:00:00Z');
      const foreign = await other.participant('2026-10-04T01:00:00Z');

      await metric(older, '2026-10-01T01:00:00Z', 100, '10.000');
      await metric(older, '2026-10-01T01:00:01Z', 101, '10.001', 'WARNING');
      await metric(older, '2026-10-01T01:00:02Z', 101, '10.001', 'CRITICAL');
      await metric(newer, '2026-10-03T01:00:00Z', 150, '12.5');
      await metric(foreign, '2026-10-04T01:00:00Z', 200, '20');

      const rows = await repository.sessionSummaries(winx.horseId);

      expect(rows.map(toSessionPerformanceSummary)).toEqual([
        {
          sessionId: newer.sessionId,
          scheduledAt: new Date('2026-10-03T01:00:00Z'),
          avgHeartRateBpm: 150,
          maxHeartRateBpm: 150,
          avgSpeedMps: '12.500',
          maxSpeedMps: '12.500',
          alertCount: 0,
        },
        {
          sessionId: older.sessionId,
          scheduledAt: new Date('2026-10-01T01:00:00Z'),
          avgHeartRateBpm: 101,
          maxHeartRateBpm: 101,
          avgSpeedMps: '10.001',
          maxSpeedMps: '10.001',
          alertCount: 2,
        },
      ]);
    });

    it('rounds the average heart rate half up', async () => {
      const winx = await enrolledHorse('Winx');
      const participant = await winx.participant('2026-10-01T01:00:00Z');
      await metric(participant, '2026-10-01T01:00:00Z', 100, '1');
      await metric(participant, '2026-10-01T01:00:01Z', 101, '2');

      const [row] = await repository.sessionSummaries(winx.horseId);

      expect(toSessionPerformanceSummary(row)).toMatchObject({
        avgHeartRateBpm: 101,
        avgSpeedMps: '1.500',
        maxSpeedMps: '2.000',
      });
    });

    it('skips sessions without metrics and returns at most 100 sessions', async () => {
      const winx = await enrolledHorse('Winx');
      await winx.participant('2026-09-01T00:00:00Z');
      const first = await winx.participant('2026-09-02T00:00:00Z');
      await metric(first, '2026-09-02T00:00:00Z', 90, '9');
      for (let day = 0; day < 100; day++) {
        const at = new Date(Date.UTC(2026, 9, 1, 0, 0, day)).toISOString();
        await metric(await winx.participant(at), at, 100, '10');
      }

      const rows = await repository.sessionSummaries(winx.horseId);

      expect(rows).toHaveLength(100);
      expect(rows.map((row) => row.sessionId)).not.toContain(first.sessionId);
    });
  });

  describe('listMetrics', () => {
    it('returns the latest 100 points of the horse, newest first', async () => {
      const winx = await enrolledHorse('Winx');
      const other = await enrolledHorse('Gió');
      const a = await winx.participant('2026-10-01T01:00:00Z');
      const b = await winx.participant('2026-10-02T01:00:00Z');
      const foreign = await other.participant('2026-10-02T01:00:00Z');
      await metric(foreign, '2026-12-01T00:00:00Z', 200, '20');
      for (let second = 0; second < 60; second++) {
        await metric(
          a,
          new Date(Date.UTC(2026, 9, 1, 1, 0, second)).toISOString(),
          100 + second,
          '10',
        );
        await metric(
          b,
          new Date(Date.UTC(2026, 9, 2, 1, 0, second)).toISOString(),
          150,
          '12.25',
          second === 59 ? 'WARNING' : 'NORMAL',
        );
      }

      const metrics = await repository.listMetrics(winx.horseId);
      const response = toHorsePerformanceResponse(winx.horseId, metrics, []);

      expect(response.recentMetrics).toHaveLength(100);
      expect(response.latestMetric).toEqual({
        recordedAt: new Date('2026-10-02T01:00:59Z'),
        heartRateBpm: 150,
        speedMps: '12.250',
        alertLevel: 'WARNING',
      });
      expect(response.recentMetrics[99]).toEqual({
        recordedAt: new Date('2026-10-01T01:00:20Z'),
        heartRateBpm: 120,
        speedMps: '10.000',
        alertLevel: 'NORMAL',
      });
      expect(response.sessionsTracked).toBe(2);
      expect(response.latestEvaluation).toBeNull();
    });

    it('returns an empty overview for a horse without metrics', async () => {
      const winx = await enrolledHorse('Winx');

      const metrics = await repository.listMetrics(winx.horseId);

      expect(toHorsePerformanceResponse(winx.horseId, metrics, [])).toEqual({
        horseId: winx.horseId,
        sessionsTracked: 0,
        latestMetric: null,
        recentMetrics: [],
        latestEvaluation: null,
      });
    });
  });
});

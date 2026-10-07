import { ConflictException, NotFoundException } from '@nestjs/common';
import { type Model } from 'mongoose';
import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { UserRole } from '../../src/common/enums/role.enum';
import type { Actor } from '../../src/common/types/actor';
import { DomainEventPublisher } from '../../src/common/infrastructure/events/domain-event.publisher';
import { HorseAccessService } from '../../src/modules/horses/shared/horse-access.service';
import { PERFORMANCE_METRIC_CRITICAL_EVENT } from '../../src/modules/performance/constants/performance.constants';
import { MetricAlertLevel } from '../../src/modules/performance/enums/metric-alert-level.enum';
import { PerformanceMetricsService } from '../../src/modules/performance/performance-metrics/performance-metrics.service';
import {
  PerformanceMetric,
  PerformanceMetricSchema,
} from '../../src/modules/performance/schemas/performance-metric.schema';
import { PerformanceAccessService } from '../../src/modules/performance/shared/performance-access.service';
import type { RealtimeGateway } from '../../src/modules/realtime/realtime.gateway';
import { TrainingAccessService } from '../../src/modules/training/shared/training-access.service';
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

describe('PerformanceMetricsService (Postgres + MongoDB)', () => {
  let db: TestPostgres;
  let mongo: TestMongo;
  let metrics: Model<PerformanceMetric>;
  let dataSource: DataSource;
  let seed: ReturnType<typeof fixtures>;
  let service: PerformanceMetricsService;
  const emitToUser = jest.fn();

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
    service = new PerformanceMetricsService(
      metrics,
      new TrainingAccessService(dataSource, new HorseAccessService(dataSource)),
      new PerformanceAccessService(dataSource),
      new DomainEventPublisher(),
      { emitToUser } as unknown as RealtimeGateway,
      dataSource,
    );
  });

  afterAll(async () => {
    await stopTestMongo(mongo);
    await stopTestPostgres(db);
  });

  beforeEach(async () => {
    emitToUser.mockReset();
    await truncateAllTables(dataSource);
    await clearAllMongoCollections(mongo.connection);
  });

  const seedParticipant = async (status: 'ONGOING' | 'READY' = 'ONGOING') => {
    const trainer = await seed.user(UserRole.HEAD_TRAINER);
    const groom = await seed.user(UserRole.GROOM);
    const horse = await seed.horse('Winx');
    const classId = randomUUID();
    await dataSource.query(
      `INSERT INTO training_classes (id, version, name, code, head_trainer_id, start_date, end_date, status)
       VALUES ($1, 1, 'Lớp A', 'A', $2, '2026-09-01', '2026-12-31', 'ACTIVE')`,
      [classId, trainer],
    );
    const enrollmentId = randomUUID();
    await dataSource.query(
      `INSERT INTO horse_enrollments (id, version, class_id, horse_id, status, enrolled_at)
       VALUES ($1, 1, $2, $3, 'ACTIVE', '2026-09-05T00:00:00Z')`,
      [enrollmentId, classId, horse],
    );
    const planId = randomUUID();
    await dataSource.query(
      `INSERT INTO training_plans (id, version, class_id, created_by, name, phase_name, goal, start_date, end_date, status)
       VALUES ($1, 1, $2, $3, 'Giáo án', 'Nền tảng', 'Mục tiêu', '2026-09-01', '2026-12-31', 'ACTIVE')`,
      [planId, classId, trainer],
    );
    const sessionId = randomUUID();
    await dataSource.query(
      `INSERT INTO training_sessions (id, version, plan_id, name, scheduled_start_at, scheduled_end_at, status, intensity)
       VALUES ($1, 1, $2, 'Buổi 1', '2026-10-10T01:00:00Z', '2026-10-10T02:00:00Z', 'IN_PROGRESS', 'MODERATE')`,
      [sessionId, planId],
    );
    const participantId = randomUUID();
    await dataSource.query(
      `INSERT INTO session_participants (id, version, session_id, horse_id, horse_enrollment_id, status, assigned_groom_id)
       VALUES ($1, 1, $2, $3, $4, $5, $6)`,
      [participantId, sessionId, horse, enrollmentId, status, groom],
    );
    return { trainer, groom, horse, participantId };
  };

  const point = (second: number, heartRateBpm: number, speedMps = 12) => ({
    sourceId: 'sensor-1',
    recordedAt: new Date(Date.UTC(2026, 9, 10, 1, 0, second)).toISOString(),
    heartRateBpm,
    speedMps,
  });

  const outboxRows = () =>
    dataSource.query<
      Array<{ event_name: string; payload: { eventId: string } }>
    >('SELECT event_name, payload FROM outbox_events ORDER BY id');

  it('stores points with alert levels from the club default and pushes them to the class head trainer', async () => {
    const { trainer, horse, participantId } = await seedParticipant();

    const result = await service.ingest(participantId, [
      point(0, 150),
      point(1, 225),
      point(2, 150, 19),
    ]);

    expect(result).toEqual({
      accepted: 3,
      skippedDuplicates: 0,
      highestAlertLevel: MetricAlertLevel.WARNING,
    });
    const stored = await metrics
      .find({ 'meta.sessionParticipantId': participantId })
      .sort({ recordedAt: 1 })
      .lean();
    expect(stored.map((row) => row.alertLevel)).toEqual([
      MetricAlertLevel.NORMAL,
      MetricAlertLevel.WARNING,
      MetricAlertLevel.WARNING,
    ]);
    expect(stored[0].meta.horseId).toBe(horse);
    expect(emitToUser).toHaveBeenCalledWith(
      trainer,
      'performance.metrics',
      expect.objectContaining({ sessionParticipantId: participantId }),
    );
    expect(await outboxRows()).toEqual([]);
  });

  it('skips points repeated in the batch or already stored', async () => {
    const { participantId } = await seedParticipant();
    await service.ingest(participantId, [point(0, 150)]);

    const result = await service.ingest(participantId, [
      point(0, 150),
      point(1, 151),
      point(1, 151),
    ]);

    expect(result.accepted).toBe(1);
    expect(result.skippedDuplicates).toBe(2);
    expect(
      await metrics.countDocuments({
        'meta.sessionParticipantId': participantId,
      }),
    ).toBe(2);
  });

  it('writes a critical event with the same eventId for every critical batch of the participant', async () => {
    const { participantId } = await seedParticipant();

    await service.ingest(participantId, [point(0, 245)]);
    await service.ingest(participantId, [point(1, 250)]);

    const rows = await outboxRows();
    expect(rows.map((row) => row.event_name)).toEqual([
      PERFORMANCE_METRIC_CRITICAL_EVENT,
      PERFORMANCE_METRIC_CRITICAL_EVENT,
    ]);
    expect(rows[0].payload.eventId).toBe(rows[1].payload.eventId);
  });

  it('rejects points when the participant is not training', async () => {
    const { participantId } = await seedParticipant('READY');

    await expect(
      service.ingest(participantId, [point(0, 150)]),
    ).rejects.toThrow(ConflictException);
  });

  describe('reading', () => {
    const actorFor = async (userId: string, role: UserRole): Promise<Actor> => {
      const [row] = await dataSource.query<Array<{ keycloak_id: string }>>(
        'SELECT keycloak_id FROM users WHERE id = $1',
        [userId],
      );
      return { sub: row.keycloak_id, roles: [role] };
    };

    it('lists the participant points oldest first', async () => {
      const { participantId } = await seedParticipant();
      const manager = await actorFor(
        await seed.user(UserRole.CLUB_MANAGER),
        UserRole.CLUB_MANAGER,
      );
      await service.ingest(participantId, [point(2, 160), point(0, 150)]);

      const rows = await service.list(manager, participantId);

      expect(rows.map((row) => row.heartRateBpm)).toEqual([150, 160]);
      expect(rows[0].speedMps).toBe('12.000');
    });

    it('summarises averages, maxima and alert counts of the participant', async () => {
      const { participantId } = await seedParticipant();
      const manager = await actorFor(
        await seed.user(UserRole.CLUB_MANAGER),
        UserRole.CLUB_MANAGER,
      );
      await service.ingest(participantId, [
        point(0, 150, 10.0005),
        point(1, 225, 12),
        point(2, 245, 14),
      ]);

      const summary = await service.summary(manager, participantId);

      expect(summary).toEqual({
        sessionParticipantId: participantId,
        count: 3,
        avgHeartRateBpm: 207,
        maxHeartRateBpm: 245,
        avgSpeedMps: '12.000',
        maxSpeedMps: '14.000',
        warningCount: 1,
        criticalCount: 1,
        firstRecordedAt: new Date(Date.UTC(2026, 9, 10, 1, 0, 0)),
        lastRecordedAt: new Date(Date.UTC(2026, 9, 10, 1, 0, 2)),
      });
    });

    it('returns an empty summary when the participant has no points', async () => {
      const { participantId } = await seedParticipant();
      const manager = await actorFor(
        await seed.user(UserRole.CLUB_MANAGER),
        UserRole.CLUB_MANAGER,
      );

      const summary = await service.summary(manager, participantId);

      expect(summary.count).toBe(0);
      expect(summary.avgHeartRateBpm).toBeNull();
    });

    it('hides the participant from a head trainer of another class', async () => {
      const { participantId } = await seedParticipant();
      const other = await actorFor(
        await seed.user(UserRole.HEAD_TRAINER),
        UserRole.HEAD_TRAINER,
      );

      await expect(service.list(other, participantId)).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});

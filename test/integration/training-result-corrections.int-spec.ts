import { randomUUID } from 'node:crypto';
import { ConflictException, ForbiddenException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { UserRole } from '../../src/common/enums/role.enum';
import type { Actor } from '../../src/common/types/actor';
import { AuditService } from '../../src/modules/audit/services/audit.service';
import { HorseAccessService } from '../../src/modules/horses/shared/horse-access.service';
import { MediaService } from '../../src/modules/media/services/media.service';
import { PerformanceEvaluationEntity } from '../../src/modules/performance/entities/performance-evaluation.entity';
import { PerformanceEvaluationsService } from '../../src/modules/performance/evaluations/performance-evaluations.service';
import { HorseReportsRepository } from '../../src/modules/reports/horse-reports/horse-reports.repository';
import { TrialResultEntity } from '../../src/modules/training/entities/trial-result.entity';
import { TrainingAccessService } from '../../src/modules/training/shared/training-access.service';
import { TrainingOperationsFacade } from '../../src/modules/training/shared/training-operations.facade';
import { TrialResultsService } from '../../src/modules/training/time-trials/trial-results.service';
import { fixtures } from './fixtures';
import {
  startTestPostgres,
  stopTestPostgres,
  truncateAllTables,
  type TestPostgres,
} from './postgres';

const DAY_MS = 24 * 60 * 60 * 1000;

describe('Correcting trial results and evaluations after a session (Postgres)', () => {
  let db: TestPostgres;
  let dataSource: DataSource;
  let seed: ReturnType<typeof fixtures>;
  let trials: TrialResultsService;
  let evaluations: PerformanceEvaluationsService;
  let reports: HorseReportsRepository;

  beforeAll(async () => {
    db = await startTestPostgres();
    dataSource = db.dataSource;
    seed = fixtures(dataSource);
    const access = new TrainingAccessService(
      dataSource,
      new HorseAccessService(dataSource),
    );
    trials = new TrialResultsService(
      dataSource.getRepository(TrialResultEntity),
      access,
      dataSource,
      {} as MediaService,
      new AuditService(),
    );
    evaluations = new PerformanceEvaluationsService(
      dataSource.getRepository(PerformanceEvaluationEntity),
      access,
      new TrainingOperationsFacade(
        new TrainingAccessService({} as DataSource, {} as HorseAccessService),
      ),
      dataSource,
      new AuditService(),
    );
    reports = new HorseReportsRepository(dataSource);
  });

  afterAll(() => stopTestPostgres(db));

  beforeEach(() => truncateAllTables(dataSource));

  const actorOf = async (userId: string, role: UserRole): Promise<Actor> => {
    const [row] = await dataSource.query<Array<{ keycloak_id: string }>>(
      'SELECT keycloak_id FROM users WHERE id = $1',
      [userId],
    );
    return { sub: row.keycloak_id, roles: [role] };
  };

  const seedRun = async (
    participantStatus: 'COMPLETED' | 'STOPPED',
    endedDaysAgo = 1,
  ) => {
    const trainerId = await seed.user(UserRole.HEAD_TRAINER);
    const barn = await seed.barn('Khu A');
    await dataSource.query(
      'UPDATE barns SET head_trainer_id = $1 WHERE id = $2',
      [trainerId, barn],
    );
    const { classId } = await seed.trainingClass(trainerId);
    const endAt = new Date(Date.now() - endedDaysAgo * DAY_MS);
    const sessionId = randomUUID();
    await dataSource.query(
      `INSERT INTO training_sessions (id, version, class_id, name, session_type, scheduled_start_at, scheduled_end_at, status, intensity, planned_distance_m)
       VALUES ($1, 1, $2, 'Chạy thử', 'TIME_TRIAL', $3::timestamptz - interval '1 hour', $3::timestamptz, 'COMPLETED', 'HEAVY', 1200)`,
      [sessionId, classId, endAt],
    );
    const timeTrialId = randomUUID();
    await dataSource.query(
      `INSERT INTO time_trials (id, version, session_id, distance_m) VALUES ($1, 1, $2, 1200)`,
      [timeTrialId, sessionId],
    );
    const horseId = await seed.horse('Gió', { barnId: barn });
    const enrollmentId = randomUUID();
    await dataSource.query(
      `INSERT INTO horse_enrollments (id, version, class_id, horse_id, status, enrolled_at)
       VALUES ($1, 1, $2, $3, 'ACTIVE', '2026-09-05T00:00:00Z')`,
      [enrollmentId, classId, horseId],
    );
    const participantId = randomUUID();
    await dataSource.query(
      `INSERT INTO session_participants (id, version, session_id, horse_id, horse_enrollment_id, status, started_at, completed_at)
       VALUES ($1, 1, $2, $3, $4, $5, $6::timestamptz - interval '50 minutes', $6::timestamptz - interval '10 minutes')`,
      [
        participantId,
        sessionId,
        horseId,
        enrollmentId,
        participantStatus,
        endAt,
      ],
    );
    for (const [attemptNo, elapsedMs] of [
      [1, '70000'],
      [2, '68000'],
    ] as const) {
      await dataSource.query(
        `INSERT INTO trial_results (id, version, time_trial_id, session_participant_id, attempt_no, elapsed_ms, notes, recorded_by, recorded_at)
         VALUES ($1, 1, $2, $3, $4, $5, 'Bấm tay', $6, $7)`,
        [
          randomUUID(),
          timeTrialId,
          participantId,
          attemptNo,
          elapsedMs,
          trainerId,
          endAt,
        ],
      );
    }
    await dataSource.query(
      `INSERT INTO performance_evaluations (id, version, session_participant_id, evaluator_id, score, comment)
       VALUES ($1, 1, $2, $3, 6, 'Ổn')`,
      [randomUUID(), participantId, trainerId],
    );
    return {
      horseId,
      participantId,
      trainerId,
      trainer: await actorOf(trainerId, UserRole.HEAD_TRAINER),
      period: {
        from: '',
        to: '',
        start: new Date(endAt.getTime() - DAY_MS),
        end: new Date(endAt.getTime() + DAY_MS),
      },
    };
  };

  const auditsOf = (entityType: string) =>
    dataSource.query<
      Array<{
        actor_id: string;
        action: string;
        before_data: unknown;
        after_data: unknown;
        reason: string | null;
        feature: string;
      }>
    >(
      'SELECT actor_id, action, before_data, after_data, reason, feature FROM audit_logs WHERE entity_type = $1',
      [entityType],
    );

  it.each(['COMPLETED', 'STOPPED'] as const)(
    'corrects the time of a %s run, the best trial follows the new value and the audit keeps before/after and the reason',
    async (status) => {
      const run = await seedRun(status);
      const [before] = await reports.participants(run.horseId, run.period);
      expect(before.bestTrialMs).toBe('68000');

      const result = await trials.update(run.trainer, run.participantId, 2, {
        elapsedMs: 75000,
        notes: 'Bấm lại theo video',
        reason: 'Bấm giờ nhầm',
      });

      expect(result).toMatchObject({
        attemptNo: 2,
        elapsedMs: 75000,
        notes: 'Bấm lại theo video',
        recordedBy: run.trainerId,
      });
      const [after] = await reports.participants(run.horseId, run.period);
      expect(after.bestTrialMs).toBe('70000');
      await expect(auditsOf('TRIAL_RESULT')).resolves.toEqual([
        {
          actor_id: run.trainerId,
          action: 'UPDATE',
          before_data: { elapsedMs: 68000, notes: 'Bấm tay' },
          after_data: { elapsedMs: 75000, notes: 'Bấm lại theo video' },
          reason: 'Bấm giờ nhầm',
          feature: 'TIME_TRIAL',
        },
      ]);
    },
  );

  it('corrects the score and comment of an evaluation and logs before/after with the reason', async () => {
    const run = await seedRun('COMPLETED');

    const result = await evaluations.update(run.trainer, run.participantId, {
      score: 8,
      comment: null,
      reason: 'Chấm nhầm',
    });

    expect(result).toMatchObject({ score: 8, comment: null });
    const [row] = await reports.participants(run.horseId, run.period);
    expect(row).toMatchObject({ score: 8, comment: null });
    await expect(auditsOf('PERFORMANCE_EVALUATION')).resolves.toEqual([
      {
        actor_id: run.trainerId,
        action: 'UPDATE',
        before_data: { score: 6, comment: 'Ổn' },
        after_data: { score: 8, comment: null },
        reason: 'Chấm nhầm',
        feature: 'PERF_EVAL',
      },
    ]);
  });

  it('refuses both corrections more than 7 days after the scheduled end and keeps the data', async () => {
    const run = await seedRun('COMPLETED', 8);

    await expect(
      trials.update(run.trainer, run.participantId, 2, {
        elapsedMs: 75000,
        reason: 'Bấm giờ nhầm',
      }),
    ).rejects.toThrow(new ConflictException('Quá hạn sửa kết quả buổi tập'));
    await expect(
      evaluations.update(run.trainer, run.participantId, {
        score: 8,
        reason: 'Chấm nhầm',
      }),
    ).rejects.toThrow(new ConflictException('Quá hạn sửa kết quả buổi tập'));

    const [row] = await reports.participants(run.horseId, run.period);
    expect(row).toMatchObject({ bestTrialMs: '68000', score: 6 });
    await expect(dataSource.query('SELECT 1 FROM audit_logs')).resolves.toEqual(
      [],
    );
  });

  it('refuses a head trainer of another class', async () => {
    const run = await seedRun('COMPLETED');
    const other = await actorOf(
      await seed.user(UserRole.HEAD_TRAINER),
      UserRole.HEAD_TRAINER,
    );

    await expect(
      trials.update(other, run.participantId, 2, {
        elapsedMs: 75000,
        reason: 'x',
      }),
    ).rejects.toThrow(ForbiddenException);
    await expect(
      evaluations.update(other, run.participantId, { score: 8, reason: 'x' }),
    ).rejects.toThrow(ForbiddenException);
  });
});

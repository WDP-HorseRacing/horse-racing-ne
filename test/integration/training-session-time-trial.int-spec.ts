import { DataSource } from 'typeorm';
import { UserRole } from '../../src/common/enums/role.enum';
import type { Actor } from '../../src/common/types/actor';
import { HorseAccessService } from '../../src/modules/horses/shared/horse-access.service';
import { TimeTrialEntity } from '../../src/modules/training/entities/time-trial.entity';
import { TrainingSessionEntity } from '../../src/modules/training/entities/training-session.entity';
import { TrainingSubjectEntity } from '../../src/modules/training/entities/training-subject.entity';
import { TrainingIntensity } from '../../src/modules/training/enums/training-intensity.enum';
import { TrainingSessionType } from '../../src/modules/training/enums/training-session-type.enum';
import { TrainingAccessService } from '../../src/modules/training/shared/training-access.service';
import { TimeTrialsService } from '../../src/modules/training/time-trials/time-trials.service';
import { TrainingSessionsService } from '../../src/modules/training/training-sessions/training-sessions.service';
import { TrainingSubjectsService } from '../../src/modules/training/training-subjects/training-subjects.service';
import { fixtures } from './fixtures';
import {
  startTestPostgres,
  stopTestPostgres,
  truncateAllTables,
  type TestPostgres,
} from './postgres';
import { AuditService } from '../../src/modules/audit/services/audit.service';

describe('Time trial config of a training session (Postgres)', () => {
  let db: TestPostgres;
  let dataSource: DataSource;
  let seed: ReturnType<typeof fixtures>;
  let sessions: TrainingSessionsService;
  let timeTrials: TimeTrialsService;
  let subjects: TrainingSubjectsService;
  let trainer: Actor;
  let trial: string;
  let classId: string;

  beforeAll(async () => {
    db = await startTestPostgres();
    dataSource = db.dataSource;
    seed = fixtures(dataSource);
    const access = new TrainingAccessService(
      dataSource,
      new HorseAccessService(dataSource),
    );
    sessions = new TrainingSessionsService(
      dataSource.getRepository(TrainingSessionEntity),
      access,
      dataSource,
      new AuditService(),
    );
    timeTrials = new TimeTrialsService(
      dataSource.getRepository(TimeTrialEntity),
      access,
      dataSource,
      new AuditService(),
    );
    subjects = new TrainingSubjectsService(
      dataSource.getRepository(TrainingSubjectEntity),
      access,
      dataSource,
      new AuditService(),
    );
  });

  afterAll(() => stopTestPostgres(db));

  async function actorOf(role: UserRole, id?: string): Promise<Actor> {
    const userId = id ?? (await seed.user(role));
    const [row] = await dataSource.query<Array<{ keycloak_id: string }>>(
      'SELECT keycloak_id FROM users WHERE id = $1',
      [userId],
    );
    return { sub: row.keycloak_id, roles: [role] };
  }

  beforeEach(async () => {
    await truncateAllTables(dataSource);
    const trainerId = await seed.user(UserRole.HEAD_TRAINER);
    trainer = await actorOf(UserRole.HEAD_TRAINER, trainerId);
    trial = (
      await subjects.create(await actorOf(UserRole.CLUB_MANAGER), {
        name: 'Chạy thử 1200',
        sessionType: TrainingSessionType.TIME_TRIAL,
        intensity: TrainingIntensity.HEAVY,
        plannedDistanceM: 1200,
        targetTimeMs: 75000,
      })
    ).id;
    ({ classId } = await seed.trainingClass(trainerId, {
      startDate: '2030-01-01',
      endDate: '2030-12-31',
    }));
    await dataSource.query(
      `INSERT INTO training_class_phase_subjects (phase_id, subject_id, min_sessions_per_week)
       SELECT id, $2, 1 FROM training_class_phases WHERE class_id = $1`,
      [classId, trial],
    );
  });

  it('adds a time trial session to a class with its time trial config', async () => {
    const created = await sessions.createSession(trainer, classId, {
      subjectId: trial,
      sessionType: TrainingSessionType.TIME_TRIAL,
      name: 'Chạy thử giữa kỳ',
      intensity: TrainingIntensity.HEAVY,
      plannedDistanceM: 1000,
      targetTimeMs: 62000,
      scheduledStartAt: '2030-01-10T01:00:00Z',
      scheduledEndAt: '2030-01-10T02:00:00Z',
    });

    expect(created.sessionType).toBe(TrainingSessionType.TIME_TRIAL);
    await expect(
      timeTrials.getBySession(trainer, created.id),
    ).resolves.toMatchObject({
      sessionId: created.id,
      distanceM: 1000,
      targetTimeMs: 62000,
      notes: null,
    });
  });

  describe('a null target time means no target', () => {
    it('adds a time trial session without a target', async () => {
      const created = await sessions.createSession(trainer, classId, {
        subjectId: trial,
        sessionType: TrainingSessionType.TIME_TRIAL,
        name: 'Chạy thử',
        intensity: TrainingIntensity.HEAVY,
        plannedDistanceM: 1200,
        targetTimeMs: null,
        scheduledStartAt: '2030-01-10T01:00:00Z',
        scheduledEndAt: '2030-01-10T02:00:00Z',
      });

      await expect(
        timeTrials.getBySession(trainer, created.id),
      ).resolves.toMatchObject({ targetTimeMs: null });
    });

    it('configures a time trial on a session without a target', async () => {
      const [{ id: sessionId }] = await dataSource.query<Array<{ id: string }>>(
        `INSERT INTO training_sessions (version, class_id, subject_id, name, session_type, scheduled_start_at, scheduled_end_at, status, intensity, planned_distance_m)
         VALUES (1, $1, $2, 'Chạy thử', 'TIME_TRIAL', '2030-01-10T01:00:00Z', '2030-01-10T02:00:00Z', 'SCHEDULED', 'HEAVY', 1200)
         RETURNING id`,
        [classId, trial],
      );

      await expect(
        timeTrials.create(trainer, sessionId, {
          distanceM: 1200,
          targetTimeMs: null,
        }),
      ).resolves.toMatchObject({ sessionId, targetTimeMs: null });
    });
  });

  const auditsOf = (entityId: string) =>
    dataSource.query<
      Array<{
        action: string;
        entity_type: string;
        before_data: Record<string, unknown> | null;
        after_data: Record<string, unknown> | null;
        reason: string | null;
        feature: string | null;
      }>
    >(
      `SELECT action, entity_type, before_data, after_data, reason, feature
         FROM audit_logs WHERE entity_id = $1 ORDER BY created_at, id`,
      [entityId],
    );

  it('logs creating, editing and cancelling a session and editing its time trial config', async () => {
    const created = await sessions.createSession(trainer, classId, {
      subjectId: trial,
      sessionType: TrainingSessionType.TIME_TRIAL,
      name: 'Chạy thử giữa kỳ',
      intensity: TrainingIntensity.HEAVY,
      plannedDistanceM: 1000,
      targetTimeMs: 62000,
      scheduledStartAt: '2030-01-10T01:00:00Z',
      scheduledEndAt: '2030-01-10T02:00:00Z',
    });
    await sessions.updateSession(trainer, created.id, { name: 'Chạy thử 1' });
    await sessions.updateSession(trainer, created.id, { name: 'Chạy thử 1' });
    const config = await timeTrials.update(trainer, created.id, {
      distanceM: 1100,
    });
    await sessions.cancelSession(trainer, created.id, { reason: 'Mưa lớn' });

    const sessionRows = await auditsOf(created.id);
    expect(
      sessionRows.map((row) => [
        row.action,
        row.before_data,
        row.after_data,
        row.reason,
      ]),
    ).toEqual([
      [
        'CREATE',
        null,
        {
          classId,
          status: 'SCHEDULED',
          subjectId: trial,
          name: 'Chạy thử giữa kỳ',
          sessionType: TrainingSessionType.TIME_TRIAL,
          intensity: TrainingIntensity.HEAVY,
          plannedDistanceM: 1000,
          scheduledStartAt: '2030-01-10T01:00:00.000Z',
          scheduledEndAt: '2030-01-10T02:00:00.000Z',
          location: null,
          surface: null,
          notes: null,
          targetTimeMs: 62000,
          participantsCreated: 0,
        },
        null,
      ],
      ['UPDATE', { name: 'Chạy thử giữa kỳ' }, { name: 'Chạy thử 1' }, null],
      ['UPDATE', { status: 'SCHEDULED' }, { status: 'CANCELLED' }, 'Mưa lớn'],
    ]);
    await expect(auditsOf(config.id)).resolves.toEqual([
      {
        action: 'UPDATE',
        entity_type: 'TIME_TRIAL',
        before_data: { distanceM: 1000 },
        after_data: { distanceM: 1100 },
        reason: null,
        feature: 'TIME_TRIAL',
      },
    ]);
  });
});

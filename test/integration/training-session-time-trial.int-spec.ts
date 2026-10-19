import { DomainEventPublisher } from '../../src/common/infrastructure/events/domain-event.publisher';
import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { UserRole } from '../../src/common/enums/role.enum';
import type { Actor } from '../../src/common/types/actor';
import { HorseAccessService } from '../../src/modules/horses/shared/horse-access.service';
import type { MediaService } from '../../src/modules/media/services/media.service';
import { TrialResultEntity } from '../../src/modules/training/entities/trial-result.entity';
import { TrainingSessionEntity } from '../../src/modules/training/entities/training-session.entity';
import { TrainingSubjectEntity } from '../../src/modules/training/entities/training-subject.entity';
import { TrainingIntensity } from '../../src/modules/training/enums/training-intensity.enum';
import { TrainingSessionType } from '../../src/modules/training/enums/training-session-type.enum';
import { TrainingAccessService } from '../../src/modules/training/shared/training-access.service';
import { TrialResultsService } from '../../src/modules/training/time-trials/trial-results.service';
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

describe('Time trial of a training session (Postgres)', () => {
  let db: TestPostgres;
  let dataSource: DataSource;
  let seed: ReturnType<typeof fixtures>;
  let sessions: TrainingSessionsService;
  let trialResults: TrialResultsService;
  let subjects: TrainingSubjectsService;
  let trainer: Actor;
  let trainerId: string;
  let trial: string;
  let regular: string;
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
      new DomainEventPublisher(),
    );
    trialResults = new TrialResultsService(
      dataSource.getRepository(TrialResultEntity),
      access,
      dataSource,
      {} as MediaService,
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
    trainerId = await seed.user(UserRole.HEAD_TRAINER);
    trainer = await actorOf(UserRole.HEAD_TRAINER, trainerId);
    const manager = await actorOf(UserRole.CLUB_MANAGER);
    regular = (
      await subjects.create(manager, {
        name: 'Phi nước kiệu',
        sessionType: TrainingSessionType.REGULAR,
        intensity: TrainingIntensity.HEAVY,
        plannedDistanceM: 3000,
      })
    ).id;
    trial = (
      await subjects.create(manager, {
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
       SELECT id, s, 1 FROM training_class_phases, unnest($2::uuid[]) AS s WHERE class_id = $1`,
      [classId, [trial, regular]],
    );
  });

  const sessionRow = (id: string) =>
    dataSource
      .query<Array<{ session_type: string; target_time_ms: number | null }>>(
        'SELECT session_type, target_time_ms FROM training_sessions WHERE id = $1',
        [id],
      )
      .then(([row]) => row);

  it('adds a time trial session to a class with its target time', async () => {
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

    expect(created).toMatchObject({
      sessionType: TrainingSessionType.TIME_TRIAL,
      plannedDistanceM: 1000,
      targetTimeMs: 62000,
    });
    await expect(sessionRow(created.id)).resolves.toEqual({
      session_type: 'TIME_TRIAL',
      target_time_ms: 62000,
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

      expect(created.targetTimeMs).toBeNull();
    });
  });

  it('rejects a target time on a regular session at the database', async () => {
    await expect(
      dataSource.query(
        `INSERT INTO training_sessions (version, class_id, subject_id, name, session_type, scheduled_start_at, scheduled_end_at, status, intensity, planned_distance_m, target_time_ms)
         VALUES (1, $1, $2, 'Phi', 'REGULAR', '2030-01-10T01:00:00Z', '2030-01-10T02:00:00Z', 'SCHEDULED', 'HEAVY', 3000, 62000)`,
        [classId, regular],
      ),
    ).rejects.toThrow(/training_sessions_target_time_ck/);
  });

  describe('editing the subject keeps the session type of the subject', () => {
    const regularSession = () =>
      sessions.createSession(trainer, classId, {
        subjectId: regular,
        name: 'Phi nước kiệu',
        intensity: TrainingIntensity.HEAVY,
        plannedDistanceM: 3000,
        scheduledStartAt: '2030-01-10T01:00:00Z',
        scheduledEndAt: '2030-01-10T02:00:00Z',
      });

    it('turns a regular session into a time trial and records a trial result once it runs', async () => {
      const draft = await regularSession();

      const updated = await sessions.updateSession(trainer, draft.id, {
        subjectId: trial,
        plannedDistanceM: 1200,
        targetTimeMs: 75000,
      });

      expect(updated).toMatchObject({
        sessionType: TrainingSessionType.TIME_TRIAL,
        plannedDistanceM: 1200,
        targetTimeMs: 75000,
      });
      const barnId = await seed.barn('Khu A');
      await dataSource.query(
        'UPDATE barns SET head_trainer_id = $1 WHERE id = $2',
        [trainerId, barnId],
      );
      const horseId = await seed.horse('Winx', { barnId });
      const enrollmentId = randomUUID();
      await dataSource.query(
        `INSERT INTO horse_enrollments (id, version, class_id, horse_id, status, enrolled_at)
         VALUES ($1, 1, $2, $3, 'ACTIVE', '2030-01-01T00:00:00Z')`,
        [enrollmentId, classId, horseId],
      );
      const participantId = randomUUID();
      await dataSource.query(
        `UPDATE training_sessions SET status = 'IN_PROGRESS' WHERE id = $1`,
        [draft.id],
      );
      await dataSource.query(
        `INSERT INTO session_participants (id, version, session_id, horse_id, horse_enrollment_id, status, started_at)
         VALUES ($1, 1, $2, $3, $4, 'ONGOING', now())`,
        [participantId, draft.id, horseId, enrollmentId],
      );

      await expect(
        trialResults.create(trainer, participantId, {
          attemptNo: 1,
          elapsedMs: 74000,
        }),
      ).resolves.toMatchObject({
        sessionParticipantId: participantId,
        attemptNo: 1,
        elapsedMs: 74000,
      });
    });

    it('turns a time trial back into a regular session and drops its target time', async () => {
      const draft = await regularSession();
      await sessions.updateSession(trainer, draft.id, {
        subjectId: trial,
        plannedDistanceM: 1200,
        targetTimeMs: 75000,
      });

      const updated = await sessions.updateSession(trainer, draft.id, {
        subjectId: regular,
      });

      expect(updated.sessionType).toBe(TrainingSessionType.REGULAR);
      await expect(sessionRow(draft.id)).resolves.toEqual({
        session_type: 'REGULAR',
        target_time_ms: null,
      });
    });

    it('rejects a target time on a regular session', async () => {
      const draft = await regularSession();

      await expect(
        sessions.updateSession(trainer, draft.id, { targetTimeMs: 75000 }),
      ).rejects.toThrow('Chỉ môn chạy thử mới có thời gian mục tiêu');
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

  it('logs creating, editing and cancelling a session', async () => {
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
    await sessions.updateSession(trainer, created.id, { targetTimeMs: 60000 });
    await sessions.updateSession(trainer, created.id, { subjectId: regular });
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
          targetTimeMs: 62000,
          scheduledStartAt: '2030-01-10T01:00:00.000Z',
          scheduledEndAt: '2030-01-10T02:00:00.000Z',
          location: null,
          surface: null,
          notes: null,
          participantsCreated: 0,
        },
        null,
      ],
      ['UPDATE', { name: 'Chạy thử giữa kỳ' }, { name: 'Chạy thử 1' }, null],
      ['UPDATE', { targetTimeMs: 62000 }, { targetTimeMs: 60000 }, null],
      [
        'UPDATE',
        {
          subjectId: trial,
          sessionType: TrainingSessionType.TIME_TRIAL,
          targetTimeMs: 60000,
        },
        {
          subjectId: regular,
          sessionType: TrainingSessionType.REGULAR,
          targetTimeMs: null,
        },
        null,
      ],
      ['UPDATE', { status: 'SCHEDULED' }, { status: 'CANCELLED' }, 'Mưa lớn'],
    ]);
  });
});

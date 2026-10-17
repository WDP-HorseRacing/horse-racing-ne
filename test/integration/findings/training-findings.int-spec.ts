import { DomainEventPublisher } from '../../../src/common/infrastructure/events/domain-event.publisher';
import { ForbiddenException } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { Test, type TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { UserRole } from '../../../src/common/enums/role.enum';
import { DomainEventsModule } from '../../../src/common/infrastructure/events/domain-events.module';
import type { Actor } from '../../../src/common/types/actor';
import {
  clubDateTimeToInstant,
  clubToday,
} from '../../../src/common/utils/club-date';
import { AuditService } from '../../../src/modules/audit/services/audit.service';
import { HorseAccessService } from '../../../src/modules/horses/shared/horse-access.service';
import type { MediaService } from '../../../src/modules/media/services/media.service';
import { MedicalCasesService } from '../../../src/modules/medical/medical-records/medical-cases.service';
import { MedicalRecordsModule } from '../../../src/modules/medical/medical-records/medical-records.module';
import { GroomTodayService } from '../../../src/modules/stable/daily-checklists/groom-today.service';
import { HorseEnrollmentEntity } from '../../../src/modules/training/entities/horse-enrollment.entity';
import { SessionParticipantEntity } from '../../../src/modules/training/entities/session-participant.entity';
import { TrainingClassEntity } from '../../../src/modules/training/entities/training-class.entity';
import { TrainingSessionEntity } from '../../../src/modules/training/entities/training-session.entity';
import { TrialResultEntity } from '../../../src/modules/training/entities/trial-result.entity';
import { TrainingAccessService } from '../../../src/modules/training/shared/training-access.service';
import { TrainingOperationsFacade } from '../../../src/modules/training/shared/training-operations.facade';
import { TrialResultsService } from '../../../src/modules/training/time-trials/trial-results.service';
import { TrainingClassEnrollmentsService } from '../../../src/modules/training/training-classes/services/training-class-enrollments.service';
import { TrainingClassesService } from '../../../src/modules/training/training-classes/services/training-classes.service';
import { ParticipantEligibilityListener } from '../../../src/modules/training/training-sessions/participant-eligibility.listener';
import { SessionAutoCloseService } from '../../../src/modules/training/training-sessions/session-auto-close.service';
import { SessionParticipantsService } from '../../../src/modules/training/training-sessions/session-participants.service';
import { TrainingSessionsService } from '../../../src/modules/training/training-sessions/training-sessions.service';
import { TrainingIntensity } from '../../../src/modules/training/enums/training-intensity.enum';
import { fixtures } from '../fixtures';
import {
  startTestPostgres,
  truncateAllTables,
  type TestPostgres,
} from '../postgres';

const HOUR = 3_600_000;

describe('Training findings (Postgres)', () => {
  let db: TestPostgres;
  let dataSource: DataSource;
  let moduleRef: TestingModule;
  let seed: ReturnType<typeof fixtures>;
  let facade: TrainingOperationsFacade;
  let sessionsService: TrainingSessionsService;
  let participantsService: SessionParticipantsService;
  let trialResults: TrialResultsService;
  let enrollments: TrainingClassEnrollmentsService;
  let classes: TrainingClassesService;
  let listener: ParticipantEligibilityListener;
  let job: SessionAutoCloseService;
  let groomToday: GroomTodayService;
  let medicalCases: MedicalCasesService;

  let trainerId: string;
  let trainer: Actor;
  let barnId: string;
  let classId: string;
  let vetId: string;

  beforeAll(async () => {
    db = await startTestPostgres();
    dataSource = db.dataSource;
    seed = fixtures(dataSource);
    const access = new TrainingAccessService(
      dataSource,
      new HorseAccessService(dataSource),
    );
    const audit = new AuditService();
    const media = {} as MediaService;
    facade = new TrainingOperationsFacade();
    sessionsService = new TrainingSessionsService(
      dataSource.getRepository(TrainingSessionEntity),
      access,
      dataSource,
      audit,
      new DomainEventPublisher(),
    );
    participantsService = new SessionParticipantsService(
      dataSource.getRepository(SessionParticipantEntity),
      access,
      facade,
      dataSource,
      media,
      audit,
    );
    trialResults = new TrialResultsService(
      dataSource.getRepository(TrialResultEntity),
      access,
      dataSource,
      media,
      audit,
    );
    enrollments = new TrainingClassEnrollmentsService(
      dataSource.getRepository(HorseEnrollmentEntity),
      access,
      facade,
      dataSource,
      media,
      audit,
    );
    classes = new TrainingClassesService(
      dataSource.getRepository(TrainingClassEntity),
      access,
      dataSource,
      audit,
    );
    listener = new ParticipantEligibilityListener(
      dataSource,
      facade,
      new AuditService(),
    );
    job = new SessionAutoCloseService(dataSource, facade, new AuditService());
    groomToday = new GroomTodayService(dataSource);
    moduleRef = await Test.createTestingModule({
      imports: [
        EventEmitterModule.forRoot(),
        TypeOrmModule.forRootAsync({
          useFactory: () => ({ type: 'postgres' }),
          dataSourceFactory: () => Promise.resolve(dataSource),
        }),
        DomainEventsModule,
        MedicalRecordsModule,
      ],
    }).compile();
    medicalCases = moduleRef.get(MedicalCasesService);
  });

  afterAll(async () => {
    await moduleRef?.close();
    await db?.container.stop();
  });

  const actorOf = async (id: string, role: UserRole): Promise<Actor> => {
    const [row] = await dataSource.query<Array<{ keycloak_id: string }>>(
      'SELECT keycloak_id FROM users WHERE id = $1',
      [id],
    );
    return { sub: row.keycloak_id, roles: [role] };
  };

  beforeEach(async () => {
    await truncateAllTables(dataSource);
    trainerId = await seed.user(UserRole.HEAD_TRAINER);
    trainer = await actorOf(trainerId, UserRole.HEAD_TRAINER);
    vetId = await seed.user(UserRole.VETERINARIAN);
    barnId = await seed.barn('Khu A');
    await dataSource.query(
      'UPDATE barns SET head_trainer_id = $1 WHERE id = $2',
      [trainerId, barnId],
    );
    ({ classId } = await seed.trainingClass(trainerId, {
      startDate: '2020-01-01',
      endDate: '2099-12-31',
    }));
  });

  const enrolledHorse = async (inClass = classId, name?: string) => {
    const horseId = await seed.horse(
      name ?? `Ngựa ${randomUUID().slice(0, 4)}`,
      {
        barnId,
      },
    );
    const enrollmentId = randomUUID();
    await dataSource.query(
      `INSERT INTO horse_enrollments (id, version, class_id, horse_id, status, enrolled_at)
       VALUES ($1, 1, $2, $3, 'ACTIVE', '2020-01-01T00:00:00Z')`,
      [enrollmentId, inClass, horseId],
    );
    return { horseId, enrollmentId };
  };

  const session = async (
    start: Date,
    options: {
      status?: string;
      type?: string;
      inClass?: string;
      subjectId?: string;
      durationHours?: number;
    } = {},
  ) => {
    const id = randomUUID();
    await dataSource.query(
      `INSERT INTO training_sessions (id, version, class_id, subject_id, name, session_type, scheduled_start_at, scheduled_end_at, status, intensity, planned_distance_m)
       VALUES ($1, 1, $2, $3, 'Buổi', $4, $5, $6, $7, 'LIGHT', 1200)`,
      [
        id,
        options.inClass ?? classId,
        options.subjectId ?? null,
        options.type ?? 'REGULAR',
        start,
        new Date(start.getTime() + (options.durationHours ?? 1) * HOUR),
        options.status ?? 'SCHEDULED',
      ],
    );
    return id;
  };

  const participant = async (
    sessionId: string,
    owner: { horseId: string; enrollmentId: string },
    status: string,
    extra: { reason?: string | null; groomId?: string | null } = {},
  ) => {
    const id = randomUUID();
    await dataSource.query(
      `INSERT INTO session_participants (id, version, session_id, horse_id, horse_enrollment_id, status, ineligibility_reason, assigned_groom_id, started_at)
       VALUES ($1, 1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        id,
        sessionId,
        owner.horseId,
        owner.enrollmentId,
        status,
        extra.reason ?? null,
        extra.groomId ?? null,
        status === 'ONGOING' ? new Date() : null,
      ],
    );
    return id;
  };

  const participantStatus = async (id: string) => {
    const [row] = await dataSource.query<Array<{ status: string }>>(
      'SELECT status FROM session_participants WHERE id = $1',
      [id],
    );
    return row.status;
  };

  const sessionStatus = async (id: string) => {
    const [row] = await dataSource.query<Array<{ status: string }>>(
      'SELECT status FROM training_sessions WHERE id = $1',
      [id],
    );
    return row.status;
  };

  const setLock = async (horseId: string) => {
    const id = randomUUID();
    await dataSource.query(
      `INSERT INTO training_locks (id, version, horse_id, locked_by, reason, lock_start, status)
       VALUES ($1, 1, $2, $3, 'Nghỉ', now(), 'ACTIVE')`,
      [id, horseId, vetId],
    );
    return id;
  };

  const releaseLock = async (horseId: string, lockId: string) => {
    await dataSource.query(
      `UPDATE training_locks
          SET status = 'RELEASED', released_by = $2, released_at = now(), release_conclusion = 'Khỏi'
        WHERE id = $1`,
      [lockId, vetId],
    );
    await listener.handle({
      eventId: randomUUID(),
      horseId,
      lockId,
      conclusion: 'Khỏi',
    });
  };

  const trialSubject = async () => {
    const id = randomUUID();
    await dataSource.query(
      `INSERT INTO training_subjects (id, version, name, session_type, intensity, planned_distance_m, target_time_ms)
       VALUES ($1, 1, 'Chạy thử 1200', 'TIME_TRIAL', 'HEAVY', 1200, 75000)`,
      [id],
    );
    return id;
  };

  describe('B1 ONGOING participant never closes', () => {
    it('B1a: auto-close job brings an ended session with an ONGOING participant to a terminal state', async () => {
      const winx = await enrolledHorse();
      const ended = await session(new Date(Date.now() - 3 * HOUR), {
        status: 'IN_PROGRESS',
      });
      const running = await participant(ended, winx, 'ONGOING');

      await job.runEveryMinute();
      await job.runEveryMinute();

      expect({
        participant: await participantStatus(running),
        session: await sessionStatus(ended),
      }).toEqual({ participant: 'COMPLETED', session: 'COMPLETED' });
    });

    it('B1b: horse recorded DECEASED mid-session, its ONGOING participant can still be closed by the class HT', async () => {
      const winx = await enrolledHorse(classId, 'Winx');
      const live = await session(new Date(Date.now() - 0.5 * HOUR), {
        status: 'IN_PROGRESS',
      });
      const running = await participant(live, winx, 'ONGOING');
      const caseId = await seed.medicalCase(winx.horseId, vetId);
      await medicalCases.closeCase(
        await actorOf(vetId, UserRole.VETERINARIAN),
        caseId,
        {
          finalConclusion: 'Ngựa ngã chết',
          totalCost: 1_000_000,
          dateOfDeath: clubToday(),
        },
      );

      const outcome = await participantsService.complete(trainer, running).then(
        () => 'completed',
        (error: unknown) =>
          error instanceof ForbiddenException
            ? `403 ${error.message}`
            : 'other error',
      );

      expect(outcome).not.toMatch(/^403/);
      expect({
        participant: await participantStatus(running),
        session: await sessionStatus(live),
      }).not.toMatchObject({ participant: 'ONGOING' });
      expect(await sessionStatus(live)).not.toBe('IN_PROGRESS');
    });
  });

  it('B2: records a time-trial result after the last participant was completed', async () => {
    const winx = await enrolledHorse();
    const trial = await session(new Date(Date.now() - 0.5 * HOUR), {
      status: 'IN_PROGRESS',
      type: 'TIME_TRIAL',
      subjectId: await trialSubject(),
    });
    await dataSource.query(
      `INSERT INTO time_trials (id, version, session_id, distance_m) VALUES ($1, 1, $2, 1200)`,
      [randomUUID(), trial],
    );
    const run = await participant(trial, winx, 'ONGOING');
    await participantsService.complete(trainer, run);
    expect(await sessionStatus(trial)).toBe('COMPLETED');

    await expect(
      trialResults.create(trainer, run, { attemptNo: 1, elapsedMs: 74000 }),
    ).resolves.toMatchObject({ attemptNo: 1 });
  });

  describe('B7 adding a session already past its start', () => {
    const pastSession = async () => {
      const [{ subject_id: subjectId }] = await dataSource.query<
        Array<{ subject_id: string }>
      >(
        `SELECT s.subject_id FROM training_class_phase_subjects s
           JOIN training_class_phases p ON p.id = s.phase_id
          WHERE p.class_id = $1`,
        [classId],
      );
      return sessionsService.createSession(trainer, classId, {
        name: 'Buổi trễ',
        subjectId,
        intensity: TrainingIntensity.LIGHT,
        plannedDistanceM: 1200,
        scheduledStartAt: new Date(Date.now() - 2 * HOUR).toISOString(),
        scheduledEndAt: new Date(Date.now() - HOUR).toISOString(),
      });
    };

    it('B7: adding a session whose start is in the past is rejected with 409', async () => {
      await enrolledHorse();

      const error = await pastSession().then(
        () => null,
        (e: unknown) => e,
      );

      expect(error).toMatchObject({ status: 409 });
    });

    it('B7: no participant gets a fake ABSENT after adding a past session and running auto-close', async () => {
      const winx = await enrolledHorse();

      await pastSession().catch(() => null);
      await job.runEveryMinute();

      const rows = await dataSource.query<Array<{ status: string }>>(
        'SELECT status FROM session_participants WHERE horse_id = $1',
        [winx.horseId],
      );
      expect(rows.filter((row) => row.status === 'ABSENT')).toEqual([]);
    });
  });

  describe('F2-1 leaving a class with locked/ineligible future participants', () => {
    const setup = async () => {
      const winx = await enrolledHorse();
      const lockId = await setLock(winx.horseId);
      const start = new Date(Date.now() + 48 * HOUR);
      const upcoming = await session(start);
      const locked = await participant(upcoming, winx, 'CANCELLED_BY_LOCK', {
        reason: 'ACTIVE_TRAINING_LOCK',
      });
      const upcoming2 = await session(new Date(start.getTime() + 24 * HOUR));
      const ineligible = await participant(upcoming2, winx, 'INELIGIBLE', {
        reason: 'HEALTH_INJURED',
      });
      await enrollments.leave(trainer, winx.enrollmentId, {
        reason: 'Rời lớp',
      });
      return { winx, lockId, start, locked, ineligible };
    };

    it('F2-1: leaving the class cancels CANCELLED_BY_LOCK and INELIGIBLE future participants', async () => {
      const { locked, ineligible } = await setup();

      expect({
        locked: await participantStatus(locked),
        ineligible: await participantStatus(ineligible),
      }).toEqual({ locked: 'CANCELLED', ineligible: 'CANCELLED' });
    });

    it('F2-1: after leaving, the horse can enroll in another class with a session in the same slot', async () => {
      const { winx, start } = await setup();
      const other = await seed.trainingClass(trainerId, {
        startDate: '2020-01-01',
        endDate: '2099-12-31',
      });
      await session(start, { inClass: other.classId });

      const error = await enrollments
        .create(trainer, other.classId, { horseId: winx.horseId })
        .then(
          () => null,
          (e: unknown) => (e as Error).message,
        );

      expect(error).toBeNull();
    });

    it('F2-1: releasing the lock does not bring participants of a left class back to PLANNED', async () => {
      const { winx, lockId, locked } = await setup();

      await releaseLock(winx.horseId, lockId);

      expect(await participantStatus(locked)).not.toBe('PLANNED');
    });
  });

  it('B10: changing a session subject to a TIME_TRIAL subject makes it a TIME_TRIAL session', async () => {
    const regular = randomUUID();
    await dataSource.query(
      `INSERT INTO training_subjects (id, version, name, session_type, intensity, planned_distance_m)
       VALUES ($1, 1, 'Phi nước kiệu', 'REGULAR', 'LIGHT', 3000)`,
      [regular],
    );
    const draft = await session(new Date('2030-01-10T01:00:00Z'), {
      subjectId: regular,
    });
    const trial = await trialSubject();
    await dataSource.query(
      `INSERT INTO training_class_phase_subjects (phase_id, subject_id, min_sessions_per_week)
       SELECT id, $2, 1 FROM training_class_phases WHERE class_id = $1`,
      [classId, trial],
    );

    const updated = await sessionsService.updateSession(trainer, draft, {
      subjectId: trial,
    });

    expect(updated.sessionType).toBe('TIME_TRIAL');
  });

  it('B12: an enrollment at 06:00 Asia/Ho_Chi_Minh counts as that club day when the class start date moves', async () => {
    const [{ TimeZone: tz }] =
      await dataSource.query<Array<{ TimeZone: string }>>('SHOW TIME ZONE');
    expect(['UTC', 'Etc/UTC', 'GMT']).toContain(tz);
    const draft = await seed.trainingClass(trainerId, {
      startDate: '2026-10-01',
      endDate: '2026-10-28',
    });
    const horseId = await seed.horse('Winx', { barnId });
    await dataSource.query(
      `INSERT INTO horse_enrollments (id, version, class_id, horse_id, status, enrolled_at)
       VALUES ($1, 1, $2, $3, 'ACTIVE', $4)`,
      [
        randomUUID(),
        draft.classId,
        horseId,
        clubDateTimeToInstant('2026-10-02', '06:00'),
      ],
    );

    const error = await classes
      .update(trainer, draft.classId, { startDate: '2026-10-02' })
      .then(
        () => null,
        (e: unknown) => (e as Error).message,
      );

    expect(error).toBeNull();
  });

  it('F2-13: releasing a lock re-opens the participant of an IN_PROGRESS session that has not reached its start time', async () => {
    const winx = await enrolledHorse();
    const early = await enrolledHorse();
    const lockId = await setLock(winx.horseId);
    const soon = await session(new Date(Date.now() + 10 * 60_000), {
      status: 'IN_PROGRESS',
    });
    await participant(soon, early, 'ONGOING');
    const locked = await participant(soon, winx, 'CANCELLED_BY_LOCK', {
      reason: 'ACTIVE_TRAINING_LOCK',
    });

    await releaseLock(winx.horseId, lockId);

    expect(await participantStatus(locked)).toBe('PLANNED');
  });

  it('F4-1: groom-today shows a run the groom leads for a horse groomed by someone else', async () => {
    const groomA = await seed.user(UserRole.GROOM);
    const groomB = await seed.user(UserRole.GROOM);
    const winx = await enrolledHorse();
    await dataSource.query(
      `INSERT INTO groom_assignments (version, horse_id, groom_id, start_at)
       VALUES (1, $1, $2, now())`,
      [winx.horseId, groomA],
    );
    const runId = await session(clubDateTimeToInstant(clubToday(), '23:00'), {
      status: 'SCHEDULED',
    });
    await dataSource.query(
      `UPDATE training_sessions SET name = 'Dắt hộ' WHERE id = $1`,
      [runId],
    );
    await participant(runId, winx, 'PLANNED', { groomId: groomB });

    const result = await groomToday.today(
      await actorOf(groomB, UserRole.GROOM),
    );

    expect(JSON.stringify(result)).toContain('Dắt hộ');
  });
});

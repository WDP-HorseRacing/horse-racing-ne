import { DomainEventPublisher } from '../../../src/common/infrastructure/events/domain-event.publisher';
import { RequestMethod } from '@nestjs/common';
import { METHOD_METADATA } from '@nestjs/common/constants';
import { EventEmitter2, EventEmitterModule } from '@nestjs/event-emitter';
import { Test, type TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { IS_PUBLIC_KEY } from '../../../src/common/constants/auth.constants';
import { UserRole } from '../../../src/common/enums/role.enum';
import { DomainEventsModule } from '../../../src/common/infrastructure/events/domain-events.module';
import type { Actor } from '../../../src/common/types/actor';
import { AuditService } from '../../../src/modules/audit/services/audit.service';
import { HORSE_MEASUREMENT_ALERT_EVENT } from '../../../src/modules/horses/constants/horse.constants';
import { HorseMeasurementAlert } from '../../../src/modules/horses/enums/horse-measurement-alert.enum';
import { HorseAccessService } from '../../../src/modules/horses/shared/horse-access.service';
import type { HorseMeasurementAlertEvent } from '../../../src/modules/horses/types/horse.types';
import type { MediaService } from '../../../src/modules/media/services/media.service';
import { TrainingLockEntity } from '../../../src/modules/medical/entities/training-lock.entity';
import { ExamRequestsModule } from '../../../src/modules/medical/exam-requests/exam-requests.module';
import { HorseNotificationsService } from '../../../src/modules/notifications/delivery/horse-notifications.service';
import type { NotificationDeliveryService } from '../../../src/modules/notifications/delivery/notification-delivery.service';
import { NotificationRecipientsRepository } from '../../../src/modules/notifications/delivery/notification-recipients.repository';
import { PerformanceNotificationsService } from '../../../src/modules/notifications/delivery/performance-notifications.service';
import { PERFORMANCE_METRIC_CRITICAL_EVENT } from '../../../src/modules/performance/constants/performance.constants';
import { PerformanceEvaluationEntity } from '../../../src/modules/performance/entities/performance-evaluation.entity';
import { PerformanceEvaluationsService } from '../../../src/modules/performance/evaluations/performance-evaluations.service';
import { PerformanceMetricsController } from '../../../src/modules/performance/performance-metrics/performance-metrics.controller';
import { PerformanceThresholdsController } from '../../../src/modules/performance/performance-thresholds/performance-thresholds.controller';
import type { PerformanceMetricCriticalEvent } from '../../../src/modules/performance/types/performance.types';
import { DashboardRepository } from '../../../src/modules/reports/dashboard/dashboard.repository';
import { DashboardService } from '../../../src/modules/reports/dashboard/dashboard.service';
import type { ReportsAccessService } from '../../../src/modules/reports/shared/reports-access.service';
import {
  CreateTrainingClassDto,
  UpdateTrainingClassStatusDto,
} from '../../../src/modules/training/dto/training-class.dto';
import { CreateTrainingSubjectDto } from '../../../src/modules/training/dto/training-subject.dto';
import { HorseEnrollmentEntity } from '../../../src/modules/training/entities/horse-enrollment.entity';
import { SessionParticipantEntity } from '../../../src/modules/training/entities/session-participant.entity';
import { TrainingSessionEntity } from '../../../src/modules/training/entities/training-session.entity';
import { TrainingSubjectEntity } from '../../../src/modules/training/entities/training-subject.entity';
import { HorseTrainingSessionWhen } from '../../../src/modules/training/enums/horse-training-session-when.enum';
import { TrainingClassStatus } from '../../../src/modules/training/enums/training-class-status.enum';
import { TrainingIntensity } from '../../../src/modules/training/enums/training-intensity.enum';
import { TrainingSessionType } from '../../../src/modules/training/enums/training-session-type.enum';
import { HorseTrainingRepository } from '../../../src/modules/training/horse-training/horse-training.repository';
import { HorseTrainingService } from '../../../src/modules/training/horse-training/horse-training.service';
import { TrainingAccessService } from '../../../src/modules/training/shared/training-access.service';
import { TrainingOperationsFacade } from '../../../src/modules/training/shared/training-operations.facade';
import { TrialResultsService } from '../../../src/modules/training/time-trials/trial-results.service';
import { TrainingClassEnrollmentsService } from '../../../src/modules/training/training-classes/services/training-class-enrollments.service';
import { SessionParticipantsService } from '../../../src/modules/training/training-sessions/session-participants.service';
import { TrainingSessionsService } from '../../../src/modules/training/training-sessions/training-sessions.service';
import { TrainingSubjectsService } from '../../../src/modules/training/training-subjects/training-subjects.service';
import { fixtures } from '../fixtures';
import {
  startTestPostgres,
  truncateAllTables,
  type TestPostgres,
} from '../postgres';

const HOUR = 3_600_000;

const outcomeOf = (promise: Promise<unknown>) =>
  promise.then(
    () => 'ok',
    (e: { status?: number; message?: string }) =>
      `${e.status ?? 'error'} ${e.message ?? ''}`,
  );

const columnsOf = (dataSource: DataSource, entity: object) =>
  dataSource
    .getMetadata(entity as never)
    .columns.map((column) => column.propertyName);

const methodsOf = (prototype: object) =>
  Object.getOwnPropertyNames(prototype).filter(
    (name) => name !== 'constructor',
  );

describe('R3 Flow 2 + dashboard findings (Postgres)', () => {
  let db: TestPostgres;
  let dataSource: DataSource;
  let moduleRef: TestingModule;
  let seed: ReturnType<typeof fixtures>;
  let facade: TrainingOperationsFacade;
  let sessionsService: TrainingSessionsService;
  let participantsService: SessionParticipantsService;
  let enrollments: TrainingClassEnrollmentsService;
  let subjects: TrainingSubjectsService;
  let evaluations: PerformanceEvaluationsService;
  let horseTraining: HorseTrainingService;
  let dashboard: DashboardService;
  let performanceNotifications: PerformanceNotificationsService;
  let horseNotifications: HorseNotificationsService;

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
    const media = {
      signDownloadUrls: () => Promise.resolve(new Map<string, string>()),
    } as unknown as MediaService;
    facade = new TrainingOperationsFacade(
      new TrainingAccessService({} as DataSource, {} as HorseAccessService),
    );
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
      new DomainEventPublisher(),
    );
    enrollments = new TrainingClassEnrollmentsService(
      dataSource.getRepository(HorseEnrollmentEntity),
      access,
      facade,
      dataSource,
      media,
      audit,
    );
    subjects = new TrainingSubjectsService(
      dataSource.getRepository(TrainingSubjectEntity),
      access,
      dataSource,
      audit,
    );
    evaluations = new PerformanceEvaluationsService(
      dataSource.getRepository(PerformanceEvaluationEntity),
      access,
      facade,
      dataSource,
      audit,
    );
    horseTraining = new HorseTrainingService(
      new HorseAccessService(dataSource),
      new HorseTrainingRepository(dataSource),
      dataSource,
      media,
    );
    dashboard = new DashboardService(
      new DashboardRepository(dataSource),
      {
        groupMetrics: () => Promise.resolve([]),
      } as unknown as ReportsAccessService,
      dataSource,
    );
    const delivery = {
      send: (input: { recipientIds: string[] }) =>
        Promise.resolve(input.recipientIds),
    } as unknown as NotificationDeliveryService;
    const recipients = new NotificationRecipientsRepository(dataSource);
    performanceNotifications = new PerformanceNotificationsService(
      recipients,
      delivery,
    );
    horseNotifications = new HorseNotificationsService(
      recipients,
      delivery,
      dataSource,
    );
    moduleRef = await Test.createTestingModule({
      imports: [
        EventEmitterModule.forRoot(),
        TypeOrmModule.forRootAsync({
          useFactory: () => ({ type: 'postgres' }),
          dataSourceFactory: () => Promise.resolve(dataSource),
        }),
        DomainEventsModule,
        ExamRequestsModule,
      ],
    }).compile();
    await moduleRef.init();
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

  const enrolledHorse = async (
    options: { inClass?: string; health?: string; ownerId?: string } = {},
  ) => {
    const horseId = await seed.horse(`Ngựa ${randomUUID().slice(0, 4)}`, {
      barnId,
      ownerId: options.ownerId,
      health: options.health as never,
    });
    const enrollmentId = randomUUID();
    await dataSource.query(
      `INSERT INTO horse_enrollments (id, version, class_id, horse_id, status, enrolled_at)
       VALUES ($1, 1, $2, $3, 'ACTIVE', '2020-01-01T00:00:00Z')`,
      [enrollmentId, options.inClass ?? classId, horseId],
    );
    return { horseId, enrollmentId };
  };

  const subject = async (
    intensity: TrainingIntensity,
    type: TrainingSessionType = TrainingSessionType.REGULAR,
  ) => {
    const id = randomUUID();
    await dataSource.query(
      `INSERT INTO training_subjects (id, version, name, session_type, intensity, planned_distance_m)
       VALUES ($1, 1, $2, $3, $4, 1200)`,
      [id, `Môn ${id.slice(0, 8)}`, type, intensity],
    );
    return id;
  };

  const session = async (
    start: Date,
    options: {
      status?: string;
      inClass?: string;
      subjectId?: string;
      intensity?: TrainingIntensity;
    } = {},
  ) => {
    const id = randomUUID();
    await dataSource.query(
      `INSERT INTO training_sessions (id, version, class_id, subject_id, name, session_type, scheduled_start_at, scheduled_end_at, status, intensity, planned_distance_m)
       VALUES ($1, 1, $2, $3, 'Buổi', 'REGULAR', $4, $5, $6, $7, 1200)`,
      [
        id,
        options.inClass ?? classId,
        options.subjectId ?? null,
        start,
        new Date(start.getTime() + HOUR),
        options.status ?? 'SCHEDULED',
        options.intensity ?? TrainingIntensity.LIGHT,
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
      `INSERT INTO session_participants (id, version, session_id, horse_id, horse_enrollment_id, status, ineligibility_reason, assigned_groom_id)
       VALUES ($1, 1, $2, $3, $4, $5, $6, $7)`,
      [
        id,
        sessionId,
        owner.horseId,
        owner.enrollmentId,
        status,
        extra.reason ?? null,
        extra.groomId ?? null,
      ],
    );
    return id;
  };

  const statusOf = async (table: string, id: string) => {
    const [row] = await dataSource.query<Array<{ status: string }>>(
      `SELECT status FROM ${table} WHERE id = $1`,
      [id],
    );
    return row.status;
  };

  const criticalEvent = (
    horseId: string,
    participantId: string,
    sessionId: string,
  ): PerformanceMetricCriticalEvent => ({
    eventId: randomUUID(),
    horseId,
    sessionId,
    sessionParticipantId: participantId,
    headTrainerId: trainerId,
    heartRateBpm: 260,
    speedMps: '17.5',
    recordedAt: new Date().toISOString(),
  });

  it('N10a: a SCHEDULED session with no check-in can be moved to another time', async () => {
    const start = new Date(Date.now() + 72 * HOUR);
    const scheduled = await session(start);

    const outcome = await outcomeOf(
      sessionsService.updateSession(trainer, scheduled, {
        scheduledStartAt: new Date(start.getTime() + 2 * HOUR).toISOString(),
        scheduledEndAt: new Date(start.getTime() + 3 * HOUR).toISOString(),
      }),
    );

    expect(outcome).toBe('ok');
  });

  it('N10b: a participant can record that it was stopped early', () => {
    expect(columnsOf(dataSource, SessionParticipantEntity)).toEqual(
      expect.arrayContaining([expect.stringMatching(/stopped/i)]),
    );
  });

  it('N11: nobody can change the heart-rate thresholds of a horse', async () => {
    const prototype =
      PerformanceThresholdsController.prototype as unknown as Record<
        string,
        object
      >;
    const [table] = await dataSource.query<Array<{ name: string | null }>>(
      `SELECT to_regclass('performance_thresholds')::text AS name`,
    );

    expect({
      writeRoutes: methodsOf(prototype).filter(
        (name) =>
          Reflect.getMetadata(METHOD_METADATA, prototype[name]) !==
          RequestMethod.GET,
      ),
      perHorseTable: table.name,
    }).toEqual({ writeRoutes: [], perHorseTable: null });
  });

  it('N12: trial results and evaluations offer a correction operation besides the video', () => {
    expect({
      trialResults: methodsOf(TrialResultsService.prototype).filter((name) =>
        /^(update(?!Video)|correct|amend)/i.test(name),
      ).length,
      evaluations: methodsOf(PerformanceEvaluationsService.prototype).filter(
        (name) => /^(update|correct|amend)/i.test(name),
      ).length,
    }).toEqual({ trialResults: 1, evaluations: 1 });
  });

  it('N18: the head trainer cannot schedule two sessions at the same time in two of his classes', async () => {
    const start = new Date(Date.now() + 96 * HOUR);
    await session(start);
    const other = await seed.trainingClass(trainerId, {
      startDate: '2020-01-01',
      endDate: '2099-12-31',
    });

    const outcome = await outcomeOf(
      sessionsService.createSession(trainer, other.classId, {
        name: 'Buổi lớp khác',
        subjectId: (
          await dataSource.query<Array<{ subject_id: string }>>(
            `SELECT s.subject_id FROM training_class_phase_subjects s
               JOIN training_class_phases p ON p.id = s.phase_id
              WHERE p.class_id = $1`,
            [other.classId],
          )
        )[0].subject_id,
        intensity: TrainingIntensity.LIGHT,
        plannedDistanceM: 1200,
        scheduledStartAt: start.toISOString(),
        scheduledEndAt: new Date(start.getTime() + HOUR).toISOString(),
      }),
    );

    expect(outcome).toMatch(
      /^409 Trùng giờ với lịch của Huấn luyện viên trưởng: lớp /,
    );
  });

  it('D1: a training lock can carry a maximum allowed intensity (e.g. LIGHT)', () => {
    expect(columnsOf(dataSource, TrainingLockEntity)).toEqual(
      expect.arrayContaining([expect.stringMatching(/intensity/i)]),
    );
  });

  it('D2: a participant can override distance or intensity of its session', () => {
    expect(columnsOf(dataSource, SessionParticipantEntity)).toEqual(
      expect.arrayContaining([expect.stringMatching(/distance|intensity/i)]),
    );
  });

  it('D5: the metric ingest routes are not public', () => {
    const isPublic = (name: 'ingest' | 'ingestBatch'): boolean =>
      Reflect.getMetadata(
        IS_PUBLIC_KEY,
        Object.getOwnPropertyDescriptor(
          PerformanceMetricsController.prototype,
          name,
        )?.value as object,
      ) === true;
    expect({
      ingest: isPublic('ingest'),
      ingestBatch: isPublic('ingestBatch'),
    }).toEqual({ ingest: false, ingestBatch: false });
  });

  it('F2-2: creating a class accepts the 728 sessions a 104-week plan can generate', async () => {
    const errors = await validate(
      plainToInstance(CreateTrainingClassDto, {
        code: 'TC-1',
        name: 'Lớp',
        planId: randomUUID(),
        startDate: '2030-01-01',
        sessions: Array.from({ length: 728 }, () => ({})),
      }),
    );

    expect(
      errors
        .filter((error) => error.property === 'sessions')
        .flatMap((error) => Object.values(error.constraints ?? {})),
    ).toEqual([]);
  });

  describe('F2-3 horse moved to another barn after its run', () => {
    const movedRun = async () => {
      const winx = await enrolledHorse();
      const done = await session(new Date(Date.now() - 3 * HOUR), {
        status: 'COMPLETED',
      });
      const run = await participant(done, winx, 'COMPLETED');
      const otherBarn = await seed.barn('Khu B');
      await dataSource.query('UPDATE horses SET barn_id = $2 WHERE id = $1', [
        winx.horseId,
        otherBarn,
      ]);
      return run;
    };

    it('F2-3: the class HT can still evaluate the run', async () => {
      const run = await movedRun();

      const outcome = await outcomeOf(
        evaluations.create(trainer, run, { score: 8, comment: 'Tốt' }),
      );

      expect(outcome).toBe('ok');
    });

    it('F2-3: the class HT can still read the run', async () => {
      const run = await movedRun();
      const access = new TrainingAccessService(
        dataSource,
        new HorseAccessService(dataSource),
      );

      const outcome = await outcomeOf(
        access.assertCanReadParticipant(trainer, run),
      );

      expect(outcome).toBe('ok');
    });
  });

  it('F2-4: an ABSENT participant can be checked in again by the HT', async () => {
    const winx = await enrolledHorse();
    const live = await session(new Date(Date.now() - 0.25 * HOUR), {
      status: 'IN_PROGRESS',
    });
    const run = await participant(live, winx, 'ABSENT');

    const outcome = await outcomeOf(participantsService.checkIn(trainer, run));

    expect(outcome).toBe('ok');
    expect(await statusOf('session_participants', run)).toBe('PRESENT');
  });

  describe('F2-5 groom notifications', () => {
    it('F2-5: assigning a groom to a run writes a domain event for the groom', async () => {
      const groomId = await seed.user(UserRole.GROOM);
      const winx = await enrolledHorse();
      const upcoming = await session(new Date(Date.now() + 48 * HOUR));
      const run = await participant(upcoming, winx, 'PLANNED');

      await participantsService.assignGroom(trainer, run, { groomId });

      const [{ count }] = await dataSource.query<Array<{ count: number }>>(
        `SELECT COUNT(*)::int AS count FROM outbox_events WHERE payload::text LIKE '%' || $1 || '%'`,
        [groomId],
      );
      expect(count).toBeGreaterThan(0);
    });

    it('F2-5: the groom leading the run receives the CRITICAL alert', async () => {
      const groomId = await seed.user(UserRole.GROOM);
      const winx = await enrolledHorse();
      const live = await session(new Date(Date.now() - 0.5 * HOUR), {
        status: 'IN_PROGRESS',
      });
      const run = await participant(live, winx, 'ONGOING', { groomId });

      const recipients = await performanceNotifications.notifyCriticalMetric(
        criticalEvent(winx.horseId, run, live),
      );

      expect(recipients).toContain(groomId);
    });
  });

  it('F2-6: measurement alerts and CRITICAL metrics notify only, they create no exam request', async () => {
    const emitter = moduleRef.get(EventEmitter2);
    expect(emitter.listeners(HORSE_MEASUREMENT_ALERT_EVENT).length).toBe(0);
    const winx = await enrolledHorse();
    const live = await session(new Date(Date.now() - 0.5 * HOUR), {
      status: 'IN_PROGRESS',
    });
    const run = await participant(live, winx, 'ONGOING');

    await emitter.emitAsync(
      PERFORMANCE_METRIC_CRITICAL_EVENT,
      criticalEvent(winx.horseId, run, live),
    );

    const [{ count }] = await dataSource.query<Array<{ count: number }>>(
      'SELECT COUNT(*)::int AS count FROM medical_exam_requests WHERE horse_id = $1',
      [winx.horseId],
    );
    expect(count).toBe(0);
  });

  it('F2-7: leaving a class with a future leave date is rejected', async () => {
    const winx = await enrolledHorse();

    const outcome = await outcomeOf(
      enrollments.leave(trainer, winx.enrollmentId, {
        leftAt: new Date(Date.now() + 72 * HOUR).toISOString(),
      }),
    );

    expect(outcome).not.toBe('ok');
    expect(await statusOf('horse_enrollments', winx.enrollmentId)).toBe(
      'ACTIVE',
    );
  });

  it('F2-8: cancelling a class requires re-typing the class code', async () => {
    const errors = await validate(
      plainToInstance(UpdateTrainingClassStatusDto, {
        status: TrainingClassStatus.CANCELLED,
        cancelReason: 'Nhầm',
      }),
    );

    expect(errors).not.toEqual([]);
  });

  describe('F2-9 subject name uniqueness', () => {
    const body = (name: string) => ({
      name,
      sessionType: TrainingSessionType.REGULAR,
      intensity: TrainingIntensity.LIGHT,
      plannedDistanceM: 1200,
    });

    it('F2-9: a subject name differing only in case is a duplicate (409)', async () => {
      await subjects.create(trainer, body('Phi nước kiệu'));

      const outcome = await outcomeOf(
        subjects.create(trainer, body('phi nước kiệu')),
      );

      expect(outcome).toMatch(/^409/);
    });

    it('F2-9: a whitespace-only subject name fails validation', async () => {
      const errors = await validate(
        plainToInstance(CreateTrainingSubjectDto, body('   ')),
      );

      expect(errors.map((error) => error.property)).toContain('name');
    });
  });

  it('F2-10: time-trial distance has one source: no time-trial table stores a distance', async () => {
    const columns = await dataSource.query<Array<{ table_name: string }>>(
      `SELECT table_name FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name IN ('time_trials', 'trial_results')
          AND column_name LIKE '%distance%'`,
    );

    expect(columns).toEqual([]);
  });

  it('F2-11: a groom not assigned to the run cannot read its evaluation', async () => {
    const stranger = await seed.user(UserRole.GROOM);
    const winx = await enrolledHorse();
    const done = await session(new Date(Date.now() - 3 * HOUR), {
      status: 'COMPLETED',
    });
    const run = await participant(done, winx, 'COMPLETED');
    await evaluations.create(trainer, run, { score: 7, comment: 'Mật' });

    const outcome = await outcomeOf(
      evaluations.get(await actorOf(stranger, UserRole.GROOM), run),
    );

    expect(outcome).not.toBe('ok');
  });

  it('F2-12: the upcoming tab shows a future run cancelled by a training lock', async () => {
    const winx = await enrolledHorse();
    const upcoming = await session(new Date(Date.now() + 48 * HOUR));
    await participant(upcoming, winx, 'CANCELLED_BY_LOCK', {
      reason: 'ACTIVE_TRAINING_LOCK',
    });
    const later = await session(new Date(Date.now() + 96 * HOUR));
    await participant(later, winx, 'PLANNED');

    const page = await horseTraining.listSessions(trainer, winx.horseId, {
      when: HorseTrainingSessionWhen.UPCOMING,
      page: 1,
      limit: 20,
    });

    expect(JSON.stringify(page)).toContain('PLANNED');
    expect(JSON.stringify(page)).toContain('CANCELLED_BY_LOCK');
  });

  it('F2-15: an UNDER_OBSERVATION horse is ineligible for a session whose subject is HEAVY even if the session says LIGHT', async () => {
    const winx = await enrolledHorse({ health: 'UNDER_OBSERVATION' });
    const draft = await session(new Date(Date.now() + 48 * HOUR), {
      subjectId: await subject(TrainingIntensity.HEAVY),
      intensity: TrainingIntensity.LIGHT,
    });

    await sessionsService.updateSession(trainer, draft, { name: 'Đổi tên' });

    const [row] = await dataSource.query<Array<{ status: string }>>(
      'SELECT status FROM session_participants WHERE session_id = $1 AND horse_id = $2',
      [draft, winx.horseId],
    );
    expect(row.status).toBe('INELIGIBLE');
  });

  it('F2-17: leaving with an unknown enrollment id returns 404', async () => {
    const outcome = await outcomeOf(
      enrollments.leave(trainer, randomUUID(), {}),
    );

    expect(outcome).toMatch(/^404/);
  });

  it('O-2: dashboard for a past month counts runs of a horse sold afterwards', async () => {
    const cm = await seed.user(UserRole.CLUB_MANAGER);
    const sold = await enrolledHorse();
    await dataSource.query(
      `UPDATE horses SET lifecycle_status = 'TRANSFERRED' WHERE id = $1`,
      [sold.horseId],
    );
    const august = await session(new Date('2026-08-10T01:00:00Z'), {
      status: 'COMPLETED',
    });
    await participant(august, sold, 'COMPLETED');

    const result = await dashboard.get(
      await actorOf(cm, UserRole.CLUB_MANAGER),
      { from: '2026-08-01', to: '2026-08-31' },
    );

    expect(result.training.completed).toBe(1);
  });

  describe('O-5 owner receives health and performance alerts', () => {
    it('O-5: owner receives the FEVER alert', async () => {
      const ownerId = await seed.user(UserRole.HORSE_OWNER);
      const horseId = await seed.horse('Gió', { barnId, ownerId });
      const event = {
        alert: HorseMeasurementAlert.FEVER,
        severity: 'URGENT',
        measurementId: randomUUID(),
        horseId,
        measuredBy: vetId,
        type: 'TEMPERATURE',
        value: 39.5,
        unit: '°C',
        measuredAt: new Date().toISOString(),
        source: 'STAFF',
      } as unknown as HorseMeasurementAlertEvent;

      const recipients = await horseNotifications.notifyMeasurementAlert(event);

      expect(recipients).toContain(ownerId);
    });

    it('O-5: owner receives the CRITICAL performance alert', async () => {
      const ownerId = await seed.user(UserRole.HORSE_OWNER);
      const winx = await enrolledHorse({ ownerId });
      const live = await session(new Date(Date.now() - 0.5 * HOUR), {
        status: 'IN_PROGRESS',
      });
      const run = await participant(live, winx, 'ONGOING');

      const recipients = await performanceNotifications.notifyCriticalMetric(
        criticalEvent(winx.horseId, run, live),
      );

      expect(recipients).toContain(ownerId);
    });
  });
});

import { EventEmitterModule } from '@nestjs/event-emitter';
import { Test, type TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { plainToInstance } from 'class-transformer';
import { validateSync, type ValidationError } from 'class-validator';
import type { Model } from 'mongoose';
import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { UserRole } from '../../../src/common/enums/role.enum';
import { DomainEventPublisher } from '../../../src/common/infrastructure/events/domain-event.publisher';
import { DomainEventsModule } from '../../../src/common/infrastructure/events/domain-events.module';
import type { Actor } from '../../../src/common/types/actor';
import {
  clubDateTimeToInstant,
  shiftDays,
} from '../../../src/common/utils/club-date';
import { AuditService } from '../../../src/modules/audit/services/audit.service';
import { HorseMeasurementListQueryDto } from '../../../src/modules/horses/dto/horse-measure.dto';
import { UpdateHorseLifecycleDto } from '../../../src/modules/horses/dto/horse-status.dto';
import { HorseMeasurementEntity } from '../../../src/modules/horses/entities/horse-measurement.entity';
import { HorseLifecycleStatus } from '../../../src/modules/horses/enums/horse-status.enum';
import { HorseMeasurementType } from '../../../src/modules/horses/enums/horse-measurement-type.enum';
import { HorseMeasurementsService } from '../../../src/modules/horses/horse-measurements/horse-measurements.service';
import { HorseAccessService } from '../../../src/modules/horses/shared/horse-access.service';
import type { MediaService } from '../../../src/modules/media/services/media.service';
import { CareSchedulesModule } from '../../../src/modules/medical/care-schedules/care-schedules.module';
import { CareSchedulesService } from '../../../src/modules/medical/care-schedules/care-schedules.service';
import { CheckupsService } from '../../../src/modules/medical/care-schedules/checkups.service';
import { CareScheduleType } from '../../../src/modules/medical/constants/care-schedule.enum';
import { CaseLockDecision } from '../../../src/modules/medical/constants/medical-case.enum';
import {
  MedicalVisitConclusion,
  MedicalVisitKind,
} from '../../../src/modules/medical/constants/medical-visit.enum';
import { SetCheckupAppointmentDto } from '../../../src/modules/medical/dto/checkup.dto';
import { CreateCareScheduleDto } from '../../../src/modules/medical/dto/create-care-schedule.dto';
import { CreateTrainingLockDto } from '../../../src/modules/medical/dto/create-training-lock.dto';
import { CloseMedicalCaseDto } from '../../../src/modules/medical/dto/medical-case.dto';
import {
  CreateFollowUpVisitDto,
  CreateStandaloneVisitDto,
} from '../../../src/modules/medical/dto/medical-visit.dto';
import {
  CompleteCareScheduleDto,
  UpdateCareScheduleDto,
} from '../../../src/modules/medical/dto/update-care-schedule.dto';
import { MedicalCasesService } from '../../../src/modules/medical/medical-records/medical-cases.service';
import { MedicalRecordsModule } from '../../../src/modules/medical/medical-records/medical-records.module';
import { MedicalVisitsService } from '../../../src/modules/medical/medical-records/medical-visits.service';
import { TrainingLocksModule } from '../../../src/modules/medical/training-locks/training-locks.module';
import { TrainingLockService } from '../../../src/modules/medical/training-locks/training-locks.service';
import { IngestMetricDto } from '../../../src/modules/performance/dto/ingest-metric.dto';
import { PerformanceMetricsService } from '../../../src/modules/performance/performance-metrics/performance-metrics.service';
import type { PerformanceMetric } from '../../../src/modules/performance/schemas/performance-metric.schema';
import type { RealtimeGateway } from '../../../src/modules/realtime/realtime.gateway';
import { CreateTrainingClassDto } from '../../../src/modules/training/dto/training-class.dto';
import {
  CreateHorseEnrollmentDto,
  LeaveHorseEnrollmentDto,
} from '../../../src/modules/training/dto/horse-enrollment.dto';
import {
  CreateTrainingSessionDto,
  UpdateTrainingSessionDto,
} from '../../../src/modules/training/dto/training-session.dto';
import { HorseEnrollmentEntity } from '../../../src/modules/training/entities/horse-enrollment.entity';
import { TrainingClassEntity } from '../../../src/modules/training/entities/training-class.entity';
import { TrainingSessionEntity } from '../../../src/modules/training/entities/training-session.entity';
import { TrainingIntensity } from '../../../src/modules/training/enums/training-intensity.enum';
import { classEndDate } from '../../../src/modules/training/policies/training.policy';
import { TrainingAccessService } from '../../../src/modules/training/shared/training-access.service';
import { TrainingOperationsFacade } from '../../../src/modules/training/shared/training-operations.facade';
import { TrainingClassEnrollmentsService } from '../../../src/modules/training/training-classes/services/training-class-enrollments.service';
import { TrainingClassesService } from '../../../src/modules/training/training-classes/services/training-classes.service';
import { TrainingSessionsService } from '../../../src/modules/training/training-sessions/training-sessions.service';
import { fixtures } from '../fixtures';
import {
  startTestPostgres,
  truncateAllTables,
  type TestPostgres,
} from '../postgres';

/** Ngày CLB cố định dùng làm "hôm nay"; đồng hồ giả đứng ở 10:00 giờ CLB */
const D = '2026-10-15';
/** Chuỗi không offset cho mốc đã qua: 20:00 giờ CLB ngày D-1 */
const PAST = `${shiftDays(D, -1)}T20:00:00`;
/** Chuỗi không offset cho mốc sắp tới: 20:00 giờ CLB ngày D */
const LATER = `${D}T20:00:00`;
const LATER_END = `${D}T21:00:00`;
const REJECTED = 'rejected by DTO validation';

/** Thời điểm đúng nếu chuỗi không offset được hiểu là giờ CLB */
const club = (local: string) =>
  clubDateTimeToInstant(local.slice(0, 10), local.slice(11, 16)).toISOString();

const fakeNow = (clubDate: string, clubTime: string) =>
  jest.useFakeTimers({
    now: clubDateTimeToInstant(clubDate, clubTime),
    doNotFake: [
      'nextTick',
      'setImmediate',
      'clearImmediate',
      'setInterval',
      'clearInterval',
      'setTimeout',
      'clearTimeout',
      'queueMicrotask',
      'hrtime',
      'performance',
    ],
  });

const failedProperties = (errors: ValidationError[]): string[] =>
  errors.flatMap((error) => [
    error.property,
    ...failedProperties(error.children ?? []),
  ]);

const iso = (value: unknown) =>
  value instanceof Date ? value.toISOString() : String(value);

describe(`R3 timezone findings (process TZ=${process.env.TZ ?? Intl.DateTimeFormat().resolvedOptions().timeZone})`, () => {
  let db: TestPostgres;
  let dataSource: DataSource;
  let moduleRef: TestingModule;
  let seed: ReturnType<typeof fixtures>;
  let visits: MedicalVisitsService;
  let cases: MedicalCasesService;
  let careSchedules: CareSchedulesService;
  let checkups: CheckupsService;
  let locks: TrainingLockService;
  let measurements: HorseMeasurementsService;
  let sessions: TrainingSessionsService;
  let classes: TrainingClassesService;
  let enrollments: TrainingClassEnrollmentsService;
  let metrics: PerformanceMetricsService;
  const inserted: Array<{ recordedAt: Date }> = [];

  let vetId: string;
  let vet: Actor;
  let trainerId: string;
  let trainer: Actor;
  let barn: string;
  let gio: string;

  const actorOf = async (id: string, role: UserRole): Promise<Actor> => {
    const [row] = await dataSource.query<{ keycloak_id: string }[]>(
      'SELECT keycloak_id FROM users WHERE id = $1',
      [id],
    );
    return { sub: row.keycloak_id, roles: [role] };
  };

  const one = async (sql: string, params: unknown[]): Promise<unknown> => {
    const rows = await dataSource.query<Array<{ v: unknown }>>(sql, params);
    return rows[0]?.v;
  };

  /**
   * Chạy một input qua DTO validation rồi service, trả về cách hệ thống hiểu chuỗi thời điểm
   *
   * @returns REJECTED nếu DTO chặn field, lỗi của service nếu service ném, ngược lại giá trị đã lưu dạng ISO
   */
  const interpret = async (
    dto: new () => object,
    body: object,
    field: string,
    run: () => Promise<unknown>,
    stored: () => Promise<unknown>,
  ): Promise<string> => {
    const errors = validateSync(plainToInstance(dto, body));
    if (failedProperties(errors).includes(field)) return REJECTED;
    try {
      await run();
    } catch (error) {
      return `${(error as Error).constructor.name}: ${(error as Error).message}`;
    }
    return iso(await stored());
  };

  const expectClubTime = (result: string, local: string) =>
    expect(result === REJECTED ? club(local) : result).toBe(club(local));

  const subjectOf = async (planId: string) =>
    (await one(
      `SELECT ps.subject_id AS v FROM training_plan_subjects ps
         JOIN training_plan_phases p ON p.id = ps.phase_id WHERE p.plan_id = $1`,
      [planId],
    )) as string;

  const activeClass = (startDate = shiftDays(D, -7)) =>
    seed.trainingClass(trainerId, {
      startDate,
      endDate: classEndDate(startDate, 4),
      status: 'ACTIVE',
    });

  beforeAll(async () => {
    db = await startTestPostgres();
    dataSource = db.dataSource;
    seed = fixtures(dataSource);
    moduleRef = await Test.createTestingModule({
      imports: [
        EventEmitterModule.forRoot(),
        TypeOrmModule.forRootAsync({
          useFactory: () => ({ type: 'postgres' }),
          dataSourceFactory: () => Promise.resolve(dataSource),
        }),
        DomainEventsModule,
        MedicalRecordsModule,
        CareSchedulesModule,
        TrainingLocksModule,
      ],
    }).compile();
    visits = moduleRef.get(MedicalVisitsService);
    cases = moduleRef.get(MedicalCasesService);
    careSchedules = moduleRef.get(CareSchedulesService);
    checkups = moduleRef.get(CheckupsService);
    locks = moduleRef.get(TrainingLockService);

    const audit = new AuditService();
    const events = new DomainEventPublisher();
    const horseAccess = new HorseAccessService(dataSource);
    const trainingAccess = new TrainingAccessService(dataSource, horseAccess);
    measurements = new HorseMeasurementsService(
      dataSource.getRepository(HorseMeasurementEntity),
      horseAccess,
      dataSource,
      events,
      audit,
    );
    sessions = new TrainingSessionsService(
      dataSource.getRepository(TrainingSessionEntity),
      trainingAccess,
      dataSource,
      audit,
      new DomainEventPublisher(),
    );
    classes = new TrainingClassesService(
      dataSource.getRepository(TrainingClassEntity),
      trainingAccess,
      dataSource,
      audit,
    );
    enrollments = new TrainingClassEnrollmentsService(
      dataSource.getRepository(HorseEnrollmentEntity),
      trainingAccess,
      new TrainingOperationsFacade(
        new TrainingAccessService({} as DataSource, {} as HorseAccessService),
      ),
      dataSource,
      {} as MediaService,
      audit,
    );
    const metricModel = {
      find: () => ({ lean: () => Promise.resolve([]) }),
      insertMany: (docs: Array<{ recordedAt: Date }>) => {
        inserted.push(...docs);
        return Promise.resolve(docs);
      },
    } as unknown as Model<PerformanceMetric>;
    metrics = new PerformanceMetricsService(
      metricModel,
      trainingAccess,
      events,
      { emitToUser: () => undefined } as unknown as RealtimeGateway,
      dataSource,
    );
  });

  afterAll(async () => {
    await moduleRef?.close();
    await db?.container.stop();
  });

  afterEach(() => jest.useRealTimers());

  beforeEach(async () => {
    await truncateAllTables(dataSource);
    inserted.length = 0;
    vetId = await seed.user(UserRole.VETERINARIAN);
    vet = await actorOf(vetId, UserRole.VETERINARIAN);
    trainerId = await seed.user(UserRole.HEAD_TRAINER);
    trainer = await actorOf(trainerId, UserRole.HEAD_TRAINER);
    barn = await seed.barn('Khu A');
    await dataSource.query(
      'UPDATE barns SET head_trainer_id = $1 WHERE id = $2',
      [trainerId, barn],
    );
    gio = await seed.horse('Gió', { barnId: barn });
    fakeNow(D, '10:00');
  });

  it('TZ3-1 medical visit examDate without offset is club time', async () => {
    const body = {
      kind: MedicalVisitKind.ROUTINE,
      conclusion: MedicalVisitConclusion.NORMAL,
      examDate: PAST,
    } as CreateStandaloneVisitDto;
    const result = await interpret(
      CreateStandaloneVisitDto,
      body,
      'examDate',
      () => visits.createStandaloneVisit(vet, gio, body),
      () =>
        one('SELECT exam_date AS v FROM medical_records WHERE horse_id = $1', [
          gio,
        ]),
    );
    expectClubTime(result, PAST);
  });

  it('TZ3-2 follow-up visit nextVisitAt without offset is club time', async () => {
    const caseId = await seed.medicalCase(gio, vetId);
    const body = { nextVisitAt: LATER } as CreateFollowUpVisitDto;
    const result = await interpret(
      CreateFollowUpVisitDto,
      body,
      'nextVisitAt',
      () => visits.createFollowUpVisit(vet, caseId, body),
      () =>
        one(
          'SELECT next_visit_at AS v FROM medical_records WHERE case_id = $1',
          [caseId],
        ),
    );
    expectClubTime(result, LATER);
  });

  it('TZ3-3 closing a case with KEEP: lockExpectedEnd without offset is club time', async () => {
    const caseId = await seed.medicalCase(gio, vetId);
    const lockId = randomUUID();
    await dataSource.query(
      `INSERT INTO training_locks (id, version, horse_id, locked_by, reason, lock_start, status, case_id)
       VALUES ($1, 1, $2, $3, 'Đau chân', '2026-09-01T02:00:00Z', 'ACTIVE', $4)`,
      [lockId, gio, vetId, caseId],
    );
    const body = {
      finalConclusion: 'Ổn định',
      lockDecision: CaseLockDecision.KEEP,
      lockExpectedEnd: LATER,
    } as CloseMedicalCaseDto;
    const result = await interpret(
      CloseMedicalCaseDto,
      body,
      'lockExpectedEnd',
      () => cases.closeCase(vet, caseId, body),
      () =>
        one('SELECT lock_end AS v FROM training_locks WHERE id = $1', [lockId]),
    );
    expectClubTime(result, LATER);
  });

  it('TZ3-4 lifecycle dateOfDeath with a time part is rejected by the DTO (date-only field)', () => {
    const errors = validateSync(
      plainToInstance(UpdateHorseLifecycleDto, {
        lifecycleStatus: HorseLifecycleStatus.DECEASED,
        reason: 'Ngã',
        dateOfDeath: `${D}T23:20:00`,
      }),
    );
    expect(failedProperties(errors)).toContain('dateOfDeath');
  });

  it('TZ3-5 close case dateOfDeath with a time part is rejected by the DTO (date-only field)', () => {
    const errors = validateSync(
      plainToInstance(CloseMedicalCaseDto, {
        finalConclusion: 'Mất',
        dateOfDeath: `${D}T23:20:00`,
      }),
    );
    expect(failedProperties(errors)).toContain('dateOfDeath');
  });

  it('TZ3-6 training lock lockEnd without offset is club time', async () => {
    const body = { reason: 'Nghỉ', lockEnd: LATER } as CreateTrainingLockDto;
    const result = await interpret(
      CreateTrainingLockDto,
      body,
      'lockEnd',
      () => locks.setLock(vet, gio, body),
      () =>
        one('SELECT lock_end AS v FROM training_locks WHERE horse_id = $1', [
          gio,
        ]),
    );
    expectClubTime(result, LATER);
  });

  it('TZ3-7 care schedule create dueAt without offset is club time', async () => {
    const body = {
      type: CareScheduleType.FARRIER,
      dueAt: LATER,
    } as CreateCareScheduleDto;
    const result = await interpret(
      CreateCareScheduleDto,
      body,
      'dueAt',
      () => careSchedules.create(vet, gio, body),
      () =>
        one('SELECT due_at AS v FROM care_schedules WHERE horse_id = $1', [
          gio,
        ]),
    );
    expectClubTime(result, LATER);
  });

  it('TZ3-8 care schedule update dueAt without offset is club time', async () => {
    const id = await seed.schedule(
      gio,
      clubDateTimeToInstant(shiftDays(D, 3), '08:00').toISOString(),
    );
    const body = { dueAt: LATER, reason: 'Dời' } as UpdateCareScheduleDto;
    const result = await interpret(
      UpdateCareScheduleDto,
      body,
      'dueAt',
      () => careSchedules.update(vet, id, body),
      () => one('SELECT due_at AS v FROM care_schedules WHERE id = $1', [id]),
    );
    expectClubTime(result, LATER);
  });

  it('TZ3-9 care schedule complete nextDueAt without offset is club time', async () => {
    const id = await seed.schedule(
      gio,
      clubDateTimeToInstant(D, '08:00').toISOString(),
      { assignedTo: vetId },
    );
    const body = { nextDueAt: LATER } as CompleteCareScheduleDto;
    const result = await interpret(
      CompleteCareScheduleDto,
      body,
      'nextDueAt',
      () => careSchedules.complete(vet, id, body),
      () =>
        one(
          `SELECT due_at AS v FROM care_schedules WHERE horse_id = $1 AND status = 'SCHEDULED'`,
          [gio],
        ),
    );
    expectClubTime(result, LATER);
  });

  it('TZ3-10 checkup appointment scheduledAt without offset is club time', async () => {
    const body = { scheduledAt: LATER } as SetCheckupAppointmentDto;
    const result = await interpret(
      SetCheckupAppointmentDto,
      body,
      'scheduledAt',
      () => checkups.setAppointment(vet, gio, body),
      () =>
        one('SELECT due_at AS v FROM care_schedules WHERE horse_id = $1', [
          gio,
        ]),
    );
    expectClubTime(result, LATER);
  });

  it('TZ3-12 training session create scheduledStartAt without offset is club time', async () => {
    const { classId, planId } = await activeClass();
    const body = {
      name: 'Buổi tối',
      subjectId: await subjectOf(planId),
      intensity: TrainingIntensity.LIGHT,
      plannedDistanceM: 3000,
      scheduledStartAt: LATER,
      scheduledEndAt: LATER_END,
    } as CreateTrainingSessionDto;
    const result = await interpret(
      CreateTrainingSessionDto,
      body,
      'scheduledStartAt',
      () => sessions.createSession(trainer, classId, body),
      () =>
        one(
          'SELECT scheduled_start_at AS v FROM training_sessions WHERE class_id = $1',
          [classId],
        ),
    );
    expectClubTime(result, LATER);
  });

  it('TZ3-13 training session update scheduledStartAt without offset is club time', async () => {
    const { classId, planId } = await activeClass();
    const id = randomUUID();
    await dataSource.query(
      `INSERT INTO training_sessions (id, version, class_id, subject_id, name, session_type, scheduled_start_at, scheduled_end_at, status, intensity, planned_distance_m)
       VALUES ($1, 1, $2, $3, 'Buổi', 'REGULAR', $4, $5, 'SCHEDULED', 'LIGHT', 3000)`,
      [
        id,
        classId,
        await subjectOf(planId),
        clubDateTimeToInstant(shiftDays(D, 2), '06:00'),
        clubDateTimeToInstant(shiftDays(D, 2), '07:00'),
      ],
    );
    const body = {
      scheduledStartAt: LATER,
      scheduledEndAt: LATER_END,
    } as UpdateTrainingSessionDto;
    const result = await interpret(
      UpdateTrainingSessionDto,
      body,
      'scheduledStartAt',
      () => sessions.updateSession(trainer, id, body),
      () =>
        one(
          'SELECT scheduled_start_at AS v FROM training_sessions WHERE id = $1',
          [id],
        ),
    );
    expectClubTime(result, LATER);
  });

  it('TZ3-15 class create: startDate sent as an instant (Z) is taken as the club date of that instant', async () => {
    const { planId } = await seed.trainingClass(trainerId);
    const startInstant = clubDateTimeToInstant(D, '03:00').toISOString();
    const body = {
      code: 'TZ315',
      name: 'Lớp sáng',
      planId,
      startDate: startInstant,
    } as CreateTrainingClassDto;
    const errors = validateSync(plainToInstance(CreateTrainingClassDto, body));
    const result = failedProperties(errors).includes('startDate')
      ? D
      : await classes.create(trainer, body).then(
          (row) => row.startDate,
          (e: Error) => `${e.constructor.name}: ${e.message}`,
        );
    expect(result).toBe(D);
  });

  it('TZ3-16 enrollment enrolledAt without offset is club time', async () => {
    const { classId } = await activeClass();
    const body = { horseId: gio, enrolledAt: PAST } as CreateHorseEnrollmentDto;
    const result = await interpret(
      CreateHorseEnrollmentDto,
      body,
      'enrolledAt',
      () => enrollments.create(trainer, classId, body),
      () =>
        one(
          'SELECT enrolled_at AS v FROM horse_enrollments WHERE class_id = $1',
          [classId],
        ),
    );
    expectClubTime(result, PAST);
  });

  it('TZ3-17 enrollment leftAt without offset is club time', async () => {
    const { classId } = await activeClass();
    const id = randomUUID();
    await dataSource.query(
      `INSERT INTO horse_enrollments (id, version, class_id, horse_id, status, enrolled_at)
       VALUES ($1, 1, $2, $3, 'ACTIVE', $4)`,
      [id, classId, gio, clubDateTimeToInstant(shiftDays(D, -7), '08:00')],
    );
    const body = { leftAt: PAST } as LeaveHorseEnrollmentDto;
    const result = await interpret(
      LeaveHorseEnrollmentDto,
      body,
      'leftAt',
      () => enrollments.leave(trainer, id, body),
      () =>
        one('SELECT left_at AS v FROM horse_enrollments WHERE id = $1', [id]),
    );
    expectClubTime(result, PAST);
  });

  it('TZ3-18 measurement list filter from without offset is club time', async () => {
    const at9 = clubDateTimeToInstant(D, '09:00').toISOString();
    await measurements.addMeasurements(vet, gio, {
      values: [{ type: HorseMeasurementType.WEIGHT, value: 450 }],
      measuredAt: at9,
      confirmAbnormal: true,
    });
    const query = {
      from: `${D}T08:00:00`,
      page: 1,
      limit: 20,
    } as HorseMeasurementListQueryDto;
    const errors = validateSync(
      plainToInstance(HorseMeasurementListQueryDto, query),
    );
    const found = failedProperties(errors).includes('from')
      ? [at9]
      : (await measurements.listMeasurements(vet, gio, query)).items.map(
          (row) => iso(row.measuredAt),
        );
    expect(found).toEqual([at9]);
  });

  it('TZ3-19 ingested metric recordedAt without offset is club time (not dropped as future)', async () => {
    const { classId } = await activeClass();
    const sessionId = randomUUID();
    await dataSource.query(
      `INSERT INTO training_sessions (id, version, class_id, name, session_type, scheduled_start_at, scheduled_end_at, status, intensity, planned_distance_m)
       VALUES ($1, 1, $2, 'Buổi', 'REGULAR', $3, $4, 'IN_PROGRESS', 'LIGHT', 1200)`,
      [
        sessionId,
        classId,
        clubDateTimeToInstant(D, '09:30'),
        clubDateTimeToInstant(D, '11:00'),
      ],
    );
    const [enrollment] = await dataSource.query<{ id: string }[]>(
      `INSERT INTO horse_enrollments (version, class_id, horse_id, status, enrolled_at)
       VALUES (1, $1, $2, 'ACTIVE', '2020-01-01T00:00:00Z') RETURNING id`,
      [classId, gio],
    );
    const participantId = randomUUID();
    await dataSource.query(
      `INSERT INTO session_participants (id, version, session_id, horse_id, horse_enrollment_id, status, started_at)
       VALUES ($1, 1, $2, $3, $4, 'ONGOING', $5)`,
      [
        participantId,
        sessionId,
        gio,
        enrollment.id,
        clubDateTimeToInstant(D, '09:50'),
      ],
    );
    const local = `${D}T09:55:00`;
    const metric: IngestMetricDto = {
      sourceId: 'hr-1',
      recordedAt: local,
      heartRateBpm: 120,
      speedMps: 10,
    };
    const errors = validateSync(plainToInstance(IngestMetricDto, metric));
    const result = failedProperties(errors).includes('recordedAt')
      ? club(local)
      : await metrics
          .ingest(participantId, [metric])
          .then((r) =>
            r.accepted === 1
              ? iso(inserted[0].recordedAt)
              : `dropped: ${JSON.stringify(r)}`,
          );
    expect(result).toBe(club(local));
  });

  describe.each(['UTC', 'Asia/Ho_Chi_Minh'])(
    'SQL ::date without AT TIME ZONE (DB session TimeZone=%s)',
    (dbTz) => {
      beforeAll(async () => {
        await dataSource.query(
          `ALTER DATABASE "${db.container.getDatabase()}" SET timezone TO '${dbTz}'`,
        );
        await dataSource.destroy();
        await dataSource.initialize();
      });

      it('TZ3-20 moving a class one day earlier is refused when an enrollment left at 00:30 club time on the old end date', async () => {
        const start = shiftDays(D, -7);
        const { classId } = await activeClass(start);
        const oldEnd = classEndDate(start, 4);
        await dataSource.query(
          `INSERT INTO horse_enrollments (version, class_id, horse_id, status, enrolled_at, left_at)
         VALUES (1, $1, $2, 'LEFT', $3, $4)`,
          [
            classId,
            gio,
            clubDateTimeToInstant(start, '08:00'),
            clubDateTimeToInstant(oldEnd, '00:30'),
          ],
        );

        const outcome = await classes
          .update(trainer, classId, { startDate: shiftDays(start, -1) })
          .then(
            () => 'ok',
            (e: Error) => e.constructor.name,
          );

        expect(outcome).toBe('ConflictException');
      });
    },
  );
});

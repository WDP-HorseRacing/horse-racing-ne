import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';
import { Test, type TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { UserRole } from '../../src/common/enums/role.enum';
import { DomainEventsModule } from '../../src/common/infrastructure/events/domain-events.module';
import type { Actor } from '../../src/common/types/actor';
import { AuditService } from '../../src/modules/audit/services/audit.service';
import { HorseLifecycleStatus } from '../../src/modules/horses/enums/horse-status.enum';
import { HorseStatusesModule } from '../../src/modules/horses/horse-statuses/horse-statuses.module';
import { HorseStatusesService } from '../../src/modules/horses/horse-statuses/horse-statuses.service';
import { HorseAccessService } from '../../src/modules/horses/shared/horse-access.service';
import type { MediaService } from '../../src/modules/media/services/media.service';
import { PerformanceEvaluationEntity } from '../../src/modules/performance/entities/performance-evaluation.entity';
import { PerformanceEvaluationsService } from '../../src/modules/performance/evaluations/performance-evaluations.service';
import { TrialResultEntity } from '../../src/modules/training/entities/trial-result.entity';
import { TrainingAccessService } from '../../src/modules/training/shared/training-access.service';
import { TrainingOperationsFacade } from '../../src/modules/training/shared/training-operations.facade';
import { TrialResultsService } from '../../src/modules/training/time-trials/trial-results.service';
import { fixtures } from './fixtures';
import {
  startTestPostgres,
  truncateAllTables,
  type TestPostgres,
} from './postgres';

const HOUR = 3_600_000;
const ON_SITE_LIFECYCLE_MESSAGE =
  'Ngựa đang ở buổi tập (đã điểm danh), chờ kết thúc lượt tập rồi mới giải nghệ hoặc chuyển nhượng';

const outcomeOf = (promise: Promise<unknown>) =>
  promise.then(
    () => 'ok',
    (e: { status?: number; message?: string }) =>
      `${e.status ?? 'error'} ${e.message ?? ''}`,
  );

describe('Ngựa đang ở buổi tập và lượt đã tập xong (Postgres)', () => {
  let db: TestPostgres;
  let dataSource: DataSource;
  let moduleRef: TestingModule;
  let seed: ReturnType<typeof fixtures>;
  let statuses: HorseStatusesService;
  let access: TrainingAccessService;
  let evaluations: PerformanceEvaluationsService;
  let trials: TrialResultsService;
  let cm: Actor;
  let classTrainer: Actor;
  let otherTrainer: Actor;
  let otherTrainerId: string;
  let barnId: string;
  let classId: string;

  const actorOf = async (id: string, role: UserRole): Promise<Actor> => {
    const [row] = await dataSource.query<{ keycloak_id: string }[]>(
      'SELECT keycloak_id FROM users WHERE id = $1',
      [id],
    );
    return { sub: row.keycloak_id, roles: [role] };
  };

  beforeAll(async () => {
    db = await startTestPostgres();
    dataSource = db.dataSource;
    seed = fixtures(dataSource);
    moduleRef = await Test.createTestingModule({
      imports: [
        EventEmitterModule.forRoot(),
        ScheduleModule.forRoot(),
        TypeOrmModule.forRootAsync({
          useFactory: () => ({ type: 'postgres' }),
          dataSourceFactory: () => Promise.resolve(dataSource),
        }),
        DomainEventsModule,
        HorseStatusesModule,
      ],
    }).compile();
    statuses = moduleRef.get(HorseStatusesService);
    access = new TrainingAccessService(
      dataSource,
      new HorseAccessService(dataSource),
    );
    const audit = new AuditService();
    evaluations = new PerformanceEvaluationsService(
      dataSource.getRepository(PerformanceEvaluationEntity),
      access,
      new TrainingOperationsFacade(access),
      dataSource,
      audit,
    );
    trials = new TrialResultsService(
      dataSource.getRepository(TrialResultEntity),
      access,
      dataSource,
      {} as MediaService,
      audit,
    );
  });

  afterAll(async () => {
    await moduleRef?.close();
    await db?.container.stop();
  });

  beforeEach(async () => {
    await truncateAllTables(dataSource);
    cm = await actorOf(
      await seed.user(UserRole.CLUB_MANAGER),
      UserRole.CLUB_MANAGER,
    );
    const classTrainerId = await seed.user(UserRole.HEAD_TRAINER);
    classTrainer = await actorOf(classTrainerId, UserRole.HEAD_TRAINER);
    otherTrainerId = await seed.user(UserRole.HEAD_TRAINER);
    otherTrainer = await actorOf(otherTrainerId, UserRole.HEAD_TRAINER);
    barnId = await seed.barn('Khu A');
    await dataSource.query(
      'UPDATE barns SET head_trainer_id = $1 WHERE id = $2',
      [classTrainerId, barnId],
    );
    ({ classId } = await seed.trainingClass(classTrainerId, {
      startDate: '2020-01-01',
      endDate: '2030-12-31',
    }));
  });

  const run = async (
    participantStatus: string,
    sessionStatus = 'IN_PROGRESS',
  ) => {
    const horseId = await seed.horse('Winx', { barnId });
    const enrollmentId = randomUUID();
    await dataSource.query(
      `INSERT INTO horse_enrollments (id, version, class_id, horse_id, status, enrolled_at)
       VALUES ($1, 1, $2, $3, 'ACTIVE', '2020-01-01T00:00:00Z')`,
      [enrollmentId, classId, horseId],
    );
    const sessionId = randomUUID();
    const start = new Date(Date.now() - 0.5 * HOUR);
    await dataSource.query(
      `INSERT INTO training_sessions (id, version, class_id, name, session_type, scheduled_start_at, scheduled_end_at, status, intensity, planned_distance_m)
       VALUES ($1, 1, $2, 'Chạy thử', 'TIME_TRIAL', $3, $4, $5, 'LIGHT', 1200)`,
      [
        sessionId,
        classId,
        start,
        new Date(start.getTime() + HOUR),
        sessionStatus,
      ],
    );
    const participantId = randomUUID();
    await dataSource.query(
      `INSERT INTO session_participants (id, version, session_id, horse_id, horse_enrollment_id, status)
       VALUES ($1, 1, $2, $3, $4, $5)`,
      [participantId, sessionId, horseId, enrollmentId, participantStatus],
    );
    return { horseId, participantId };
  };

  const setParticipant = (participantId: string, status: string) =>
    dataSource.query(
      'UPDATE session_participants SET status = $2 WHERE id = $1',
      [participantId, status],
    );

  describe('giải nghệ, chuyển nhượng khi ngựa đang ở buổi tập', () => {
    const cases = [
      ['PRESENT', HorseLifecycleStatus.RETIRED],
      ['READY', HorseLifecycleStatus.RETIRED],
      ['ONGOING', HorseLifecycleStatus.RETIRED],
      ['PRESENT', HorseLifecycleStatus.TRANSFERRED],
      ['READY', HorseLifecycleStatus.TRANSFERRED],
      ['ONGOING', HorseLifecycleStatus.TRANSFERRED],
    ] as const;

    it.each(cases)(
      '%s -> %s: 409 and the preview is blocked with the same sentence',
      async (participantStatus, to) => {
        const { horseId } = await run(participantStatus);

        const outcome = await outcomeOf(
          statuses.updateLifecycle(cm, horseId, {
            lifecycleStatus: to,
            reason: 'Kết thúc',
          }),
        );
        const preview = await statuses.previewLifecycle(cm, horseId, {
          lifecycleStatus: to,
        });

        expect({
          outcome,
          allowed: preview.allowed,
          blockedReason: preview.blockedReason,
        }).toEqual({
          outcome: `409 ${ON_SITE_LIFECYCLE_MESSAGE}`,
          allowed: false,
          blockedReason: ON_SITE_LIFECYCLE_MESSAGE,
        });
      },
    );

    it.each([HorseLifecycleStatus.RETIRED, HorseLifecycleStatus.TRANSFERRED])(
      'allows %s once the run has ended',
      async (to) => {
        const { horseId, participantId } = await run('ONGOING');
        await setParticipant(participantId, 'COMPLETED');

        const preview = await statuses.previewLifecycle(cm, horseId, {
          lifecycleStatus: to,
        });
        await statuses.updateLifecycle(cm, horseId, {
          lifecycleStatus: to,
          reason: 'Kết thúc',
        });

        const [row] = await dataSource.query<{ lifecycle_status: string }[]>(
          'SELECT lifecycle_status FROM horses WHERE id = $1',
          [horseId],
        );
        expect({
          allowed: preview.allowed,
          lifecycle: row.lifecycle_status,
        }).toEqual({ allowed: true, lifecycle: to });
      },
    );

    it('a PLANNED participant does not block retiring', async () => {
      const { horseId } = await run('PLANNED', 'SCHEDULED');

      const preview = await statuses.previewLifecycle(cm, horseId, {
        lifecycleStatus: HorseLifecycleStatus.RETIRED,
      });

      expect(preview.allowed).toBe(true);
    });
  });

  describe('ghi nhận ngựa mất khi đang ở buổi tập', () => {
    it.each(['PLANNED', 'PRESENT', 'READY', 'ONGOING'])(
      'cancels the %s run of a session already started and logs unfinishedRunsCancelled',
      async (participantStatus) => {
        const { horseId, participantId } = await run(participantStatus);

        await statuses.updateLifecycle(cm, horseId, {
          lifecycleStatus: HorseLifecycleStatus.DECEASED,
          reason: 'Đột quỵ',
        });

        const [participant] = await dataSource.query<
          { status: string; cancel_reason: string }[]
        >(
          'SELECT status, cancel_reason FROM session_participants WHERE id = $1',
          [participantId],
        );
        const audits = await dataSource.query<
          { after: Record<string, unknown> }[]
        >(
          `SELECT after_data AS after FROM audit_logs
            WHERE entity_id = $1 AND after_data ? 'lifecycleStatus'`,
          [horseId],
        );
        expect({
          participant,
          unfinishedRunsCancelled: audits[0]?.after.unfinishedRunsCancelled,
        }).toEqual({
          participant: { status: 'CANCELLED', cancel_reason: 'Ngựa đã mất' },
          unfinishedRunsCancelled: 1,
        });
      },
    );
  });

  describe('lượt đã tập xong, ngựa đã sang khu của Head Trainer khác', () => {
    const movedRun = async () => {
      const done = await run('COMPLETED', 'COMPLETED');
      const otherBarn = await seed.barn('Khu B');
      await dataSource.query(
        'UPDATE barns SET head_trainer_id = $1 WHERE id = $2',
        [otherTrainerId, otherBarn],
      );
      await dataSource.query('UPDATE horses SET barn_id = $2 WHERE id = $1', [
        done.horseId,
        otherBarn,
      ]);
      return done;
    };

    const writesBy = async (actor: Actor, participantId: string) => ({
      createEvaluation: await outcomeOf(
        evaluations.create(actor, participantId, { score: 8, comment: 'Tốt' }),
      ),
      updateEvaluation: await outcomeOf(
        evaluations.update(actor, participantId, {
          score: 9,
          reason: 'Chấm lại',
        }),
      ),
      createTrial: await outcomeOf(
        trials.create(actor, participantId, {
          attemptNo: 1,
          elapsedMs: 75_000,
        }),
      ),
      updateTrial: await outcomeOf(
        trials.update(actor, participantId, 1, {
          elapsedMs: 74_000,
          reason: 'Sửa giờ',
        }),
      ),
    });

    it('the class HT reads the run and creates, updates evaluation and trial result', async () => {
      const { participantId } = await movedRun();

      expect({
        read: await outcomeOf(
          access.assertCanReadParticipant(classTrainer, participantId),
        ),
        ...(await writesBy(classTrainer, participantId)),
        readEvaluation: await outcomeOf(
          evaluations.get(classTrainer, participantId),
        ),
      }).toEqual({
        read: 'ok',
        createEvaluation: 'ok',
        updateEvaluation: 'ok',
        createTrial: 'ok',
        updateTrial: 'ok',
        readEvaluation: 'ok',
      });
    });

    it.each(['new barn', 'unrelated'])(
      'a HT of the %s reads the run and its evaluation',
      async (who) => {
        const { participantId } = await movedRun();
        await evaluations.create(classTrainer, participantId, { score: 8 });
        const reader =
          who === 'new barn'
            ? otherTrainer
            : await actorOf(
                await seed.user(UserRole.HEAD_TRAINER),
                UserRole.HEAD_TRAINER,
              );

        expect({
          read: await outcomeOf(
            access.assertCanReadParticipant(reader, participantId),
          ),
          readEvaluation: await outcomeOf(
            evaluations.get(reader, participantId),
          ),
        }).toEqual({ read: 'ok', readEvaluation: 'ok' });
      },
    );

    it('a groom reads the evaluation only of a run assigned to them', async () => {
      const { participantId } = await movedRun();
      await evaluations.create(classTrainer, participantId, { score: 8 });
      const assignedId = await seed.user(UserRole.GROOM);
      const otherGroomId = await seed.user(UserRole.GROOM);
      await dataSource.query(
        'UPDATE session_participants SET assigned_groom_id = $2 WHERE id = $1',
        [participantId, assignedId],
      );

      expect({
        assigned: await outcomeOf(
          evaluations.get(
            await actorOf(assignedId, UserRole.GROOM),
            participantId,
          ),
        ),
        other: await outcomeOf(
          evaluations.get(
            await actorOf(otherGroomId, UserRole.GROOM),
            participantId,
          ),
        ),
      }).toEqual({ assigned: 'ok', other: '404 Không tìm thấy lượt tập' });
    });

    it('the HT of the new barn cannot write the run', async () => {
      const { participantId } = await movedRun();
      await evaluations.create(classTrainer, participantId, { score: 8 });
      await trials.create(classTrainer, participantId, {
        attemptNo: 1,
        elapsedMs: 75_000,
      });
      const forbidden =
        '403 Lượt tập thuộc lớp của Huấn luyện viên trưởng khác';

      expect(await writesBy(otherTrainer, participantId)).toEqual({
        createEvaluation: forbidden,
        updateEvaluation: forbidden,
        createTrial: forbidden,
        updateTrial: forbidden,
      });
    });

    it('a run still ONGOING keeps the barn check for the class HT', async () => {
      const { horseId, participantId } = await run('ONGOING');
      const otherBarn = await seed.barn('Khu B');
      await dataSource.query('UPDATE horses SET barn_id = $2 WHERE id = $1', [
        horseId,
        otherBarn,
      ]);

      expect(
        await outcomeOf(
          trials.create(classTrainer, participantId, {
            attemptNo: 1,
            elapsedMs: 75_000,
          }),
        ),
      ).toBe('403 Ngựa không thuộc khu bạn phụ trách');
    });
  });

  describe('lượt đã tập xong, ngựa đã chuyển nhượng hoặc đã mất', () => {
    it.each([
      [
        HorseLifecycleStatus.TRANSFERRED,
        'Ngựa đã chuyển nhượng, hồ sơ chỉ được xem',
      ],
      [HorseLifecycleStatus.DECEASED, 'Ngựa đã mất, hồ sơ chỉ được xem'],
    ])(
      '%s: the class HT can read but not write',
      async (lifecycle, message) => {
        const { horseId, participantId } = await run('COMPLETED', 'COMPLETED');
        await evaluations.create(classTrainer, participantId, { score: 8 });
        await trials.create(classTrainer, participantId, {
          attemptNo: 1,
          elapsedMs: 75_000,
        });
        await dataSource.query(
          'UPDATE horses SET lifecycle_status = $2, barn_id = NULL WHERE id = $1',
          [horseId, lifecycle],
        );

        expect({
          read: await outcomeOf(
            access.assertCanReadParticipant(classTrainer, participantId),
          ),
          updateEvaluation: await outcomeOf(
            evaluations.update(classTrainer, participantId, {
              score: 9,
              reason: 'Chấm lại',
            }),
          ),
          createTrial: await outcomeOf(
            trials.create(classTrainer, participantId, {
              attemptNo: 2,
              elapsedMs: 75_000,
            }),
          ),
          updateTrial: await outcomeOf(
            trials.update(classTrainer, participantId, 1, {
              elapsedMs: 74_000,
              reason: 'Sửa giờ',
            }),
          ),
        }).toEqual({
          read: 'ok',
          updateEvaluation: `409 ${message}`,
          createTrial: `409 ${message}`,
          updateTrial: `409 ${message}`,
        });
      },
    );
  });
});

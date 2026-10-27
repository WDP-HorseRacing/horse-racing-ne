import { DomainEventPublisher } from '../../src/common/infrastructure/events/domain-event.publisher';
import { randomUUID } from 'node:crypto';
import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { UserRole } from '../../src/common/enums/role.enum';
import type { Actor } from '../../src/common/types/actor';
import { AuditService } from '../../src/modules/audit/services/audit.service';
import { HorseAccessService } from '../../src/modules/horses/shared/horse-access.service';
import { MediaService } from '../../src/modules/media/services/media.service';
import { PerformanceEvaluationEntity } from '../../src/modules/performance/entities/performance-evaluation.entity';
import { PerformanceEvaluationsService } from '../../src/modules/performance/evaluations/performance-evaluations.service';
import { SessionParticipantEntity } from '../../src/modules/training/entities/session-participant.entity';
import { TrialResultEntity } from '../../src/modules/training/entities/trial-result.entity';
import { TrainingAccessService } from '../../src/modules/training/shared/training-access.service';
import { TrainingOperationsFacade } from '../../src/modules/training/shared/training-operations.facade';
import { TrialResultsService } from '../../src/modules/training/time-trials/trial-results.service';
import { SessionParticipantsService } from '../../src/modules/training/training-sessions/session-participants.service';
import { fixtures } from './fixtures';
import {
  startTestPostgres,
  stopTestPostgres,
  truncateAllTables,
  type TestPostgres,
} from './postgres';

describe('Stopping a participant run early (Postgres)', () => {
  let db: TestPostgres;
  let dataSource: DataSource;
  let seed: ReturnType<typeof fixtures>;
  let participants: SessionParticipantsService;
  let trials: TrialResultsService;
  let evaluations: PerformanceEvaluationsService;

  beforeAll(async () => {
    db = await startTestPostgres();
    dataSource = db.dataSource;
    seed = fixtures(dataSource);
    const access = new TrainingAccessService(
      dataSource,
      new HorseAccessService(dataSource),
    );
    const media = {
      signDownloadUrls: () => Promise.resolve(new Map()),
    } as unknown as MediaService;
    participants = new SessionParticipantsService(
      dataSource.getRepository(SessionParticipantEntity),
      access,
      new TrainingOperationsFacade(
        new TrainingAccessService({} as DataSource, {} as HorseAccessService),
      ),
      dataSource,
      media,
      new AuditService(),
      new DomainEventPublisher(),
    );
    trials = new TrialResultsService(
      dataSource.getRepository(TrialResultEntity),
      access,
      dataSource,
      media,
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

  const seedSession = async (statuses: string[]) => {
    const trainerId = await seed.user(UserRole.HEAD_TRAINER);
    const barn = await seed.barn('Khu A');
    await dataSource.query(
      'UPDATE barns SET head_trainer_id = $1 WHERE id = $2',
      [trainerId, barn],
    );
    const { classId } = await seed.trainingClass(trainerId);
    const sessionId = randomUUID();
    await dataSource.query(
      `INSERT INTO training_sessions (id, version, class_id, name, session_type, scheduled_start_at, scheduled_end_at, status, intensity, planned_distance_m)
       VALUES ($1, 1, $2, 'Chạy thử', 'TIME_TRIAL', now() - interval '10 minutes', now() + interval '50 minutes', 'IN_PROGRESS', 'HEAVY', 1200)`,
      [sessionId, classId],
    );
    const participantIds: string[] = [];
    for (const [index, status] of statuses.entries()) {
      const horse = await seed.horse(`Ngựa ${index}`, { barnId: barn });
      const enrollmentId = randomUUID();
      await dataSource.query(
        `INSERT INTO horse_enrollments (id, version, class_id, horse_id, status, enrolled_at)
         VALUES ($1, 1, $2, $3, 'ACTIVE', '2026-09-05T00:00:00Z')`,
        [enrollmentId, classId, horse],
      );
      const participantId = randomUUID();
      await dataSource.query(
        `INSERT INTO session_participants (id, version, session_id, horse_id, horse_enrollment_id, status, started_at)
         VALUES ($1, 1, $2, $3, $4, $5::varchar, CASE WHEN $5::varchar = 'ONGOING' THEN now() - interval '5 minutes' END)`,
        [participantId, sessionId, horse, enrollmentId, status],
      );
      participantIds.push(participantId);
    }
    return {
      sessionId,
      participantIds,
      trainer: await actorOf(trainerId, UserRole.HEAD_TRAINER),
    };
  };

  const rowOf = async (participantId: string) => {
    const [row] = await dataSource.query<
      Array<{
        status: string;
        stopped_reason: string | null;
        completed_at: Date | null;
        started_at: Date | null;
      }>
    >(
      'SELECT status, stopped_reason, completed_at, started_at FROM session_participants WHERE id = $1',
      [participantId],
    );
    return row;
  };

  const sessionStatus = async (sessionId: string) => {
    const [row] = await dataSource.query<Array<{ status: string }>>(
      'SELECT status FROM training_sessions WHERE id = $1',
      [sessionId],
    );
    return row.status;
  };

  it('stops an ongoing run with its reason and end time, and logs it', async () => {
    const { participantIds, trainer, sessionId } = await seedSession([
      'ONGOING',
      'ONGOING',
    ]);
    const [id] = participantIds;

    const response = await participants.stop(trainer, id, {
      reason: 'Ngựa đi khập khiễng',
    });

    expect(response).toMatchObject({
      status: 'STOPPED',
      stoppedReason: 'Ngựa đi khập khiễng',
    });
    const row = await rowOf(id);
    expect(row).toMatchObject({
      status: 'STOPPED',
      stopped_reason: 'Ngựa đi khập khiễng',
    });
    expect(row.completed_at!.getTime()).toBeGreaterThan(
      row.started_at!.getTime(),
    );
    expect(await sessionStatus(sessionId)).toBe('IN_PROGRESS');
    const audits = await dataSource.query<
      Array<{
        before_data: unknown;
        after_data: unknown;
        reason: string;
        feature: string;
      }>
    >(
      'SELECT before_data, after_data, reason, feature FROM audit_logs WHERE entity_id = $1',
      [id],
    );
    expect(audits).toEqual([
      {
        before_data: { status: 'ONGOING' },
        after_data: { status: 'STOPPED' },
        reason: 'Ngựa đi khập khiễng',
        feature: 'TRAIN_RUN',
      },
    ]);
  });

  it('closes the session as COMPLETED when the last open run is stopped', async () => {
    const { participantIds, trainer, sessionId } = await seedSession([
      'ONGOING',
    ]);

    await participants.stop(trainer, participantIds[0], { reason: 'Mưa lớn' });

    expect(await sessionStatus(sessionId)).toBe('COMPLETED');
  });

  it('rejects stopping a run that is not ongoing with 409', async () => {
    const { participantIds, trainer } = await seedSession([
      'READY',
      'COMPLETED',
      'ONGOING',
      'ONGOING',
    ]);
    await participants.stop(trainer, participantIds[2], { reason: 'Đau' });

    for (const id of participantIds.slice(0, 3)) {
      await expect(
        participants.stop(trainer, id, { reason: 'Lần nữa' }),
      ).rejects.toThrow('Chỉ lượt đang tập mới được dừng sớm');
    }
  });

  it('rejects another head trainer with 403 and an unknown run with 404', async () => {
    const { participantIds } = await seedSession(['ONGOING']);
    const other = await actorOf(
      await seed.user(UserRole.HEAD_TRAINER),
      UserRole.HEAD_TRAINER,
    );

    await expect(
      participants.stop(other, participantIds[0], { reason: 'Đau' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      participants.stop(other, randomUUID(), { reason: 'Đau' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('treats a stopped run as ended: no groom assignment, no check-in or start again', async () => {
    const { participantIds, trainer } = await seedSession([
      'ONGOING',
      'ONGOING',
    ]);
    const [id] = participantIds;
    await participants.stop(trainer, id, { reason: 'Đau' });

    await expect(
      participants.assignGroom(trainer, id, { groomId: null }),
    ).rejects.toThrow('Không thể giao Groom cho lượt tập đã kết thúc');
    await expect(participants.start(trainer, id)).rejects.toBeInstanceOf(
      ConflictException,
    );
    await expect(participants.checkIn(trainer, id)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('still records time trial attempts for a stopped run', async () => {
    const { participantIds, trainer } = await seedSession([
      'ONGOING',
      'ONGOING',
    ]);
    const [id] = participantIds;
    await participants.stop(trainer, id, { reason: 'Đau' });

    await expect(
      trials.create(trainer, id, { attemptNo: 1, elapsedMs: 80000 }),
    ).resolves.toMatchObject({ elapsedMs: 80000 });
  });

  it('still records an evaluation for a stopped run', async () => {
    const { participantIds, trainer } = await seedSession(['ONGOING']);
    const [id] = participantIds;
    await participants.stop(trainer, id, { reason: 'Đau' });

    await expect(
      evaluations.create(trainer, id, { score: 6 }),
    ).resolves.toMatchObject({ score: 6 });
  });

  it('rejects an evaluation for a run that has not finished', async () => {
    const { participantIds, trainer } = await seedSession(['ONGOING']);

    await expect(
      evaluations.create(trainer, participantIds[0], { score: 6 }),
    ).rejects.toThrow(
      'Chỉ lượt tập đã hoàn thành hoặc dừng sớm mới được ghi dữ liệu hiệu suất',
    );
  });
});

import { HttpException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { UserRole } from '../../src/common/enums/role.enum';
import { DomainEventPublisher } from '../../src/common/infrastructure/events/domain-event.publisher';
import type { Actor } from '../../src/common/types/actor';
import { AuditService } from '../../src/modules/audit/services/audit.service';
import { HorseAccessService } from '../../src/modules/horses/shared/horse-access.service';
import type { MediaService } from '../../src/modules/media/services/media.service';
import { GroomAssignmentEntity } from '../../src/modules/stable/entities/groom-assignment.entity';
import { GroomAssignmentsRepository } from '../../src/modules/stable/groom-assignments/groom-assignments.repository';
import { GroomAssignmentsService } from '../../src/modules/stable/groom-assignments/groom-assignments.service';
import { DailyChecklistsService } from '../../src/modules/stable/shared/daily-checklists.service';
import { StableAccessService } from '../../src/modules/stable/shared/stable-access.service';
import { HorseEnrollmentEntity } from '../../src/modules/training/entities/horse-enrollment.entity';
import { TrainingSessionEntity } from '../../src/modules/training/entities/training-session.entity';
import { TrainingIntensity } from '../../src/modules/training/enums/training-intensity.enum';
import { TrainingSessionType } from '../../src/modules/training/enums/training-session-type.enum';
import { TrainingAccessService } from '../../src/modules/training/shared/training-access.service';
import { TrainingOperationsFacade } from '../../src/modules/training/shared/training-operations.facade';
import { TrainingClassEnrollmentsService } from '../../src/modules/training/training-classes/services/training-class-enrollments.service';
import { TrainingSessionsService } from '../../src/modules/training/training-sessions/training-sessions.service';
import { fixtures } from './fixtures';
import {
  startTestPostgres,
  stopTestPostgres,
  truncateAllTables,
  type TestPostgres,
} from './postgres';

const ROUNDS = 3;

const outcomeOf = (result: PromiseSettledResult<unknown>): string => {
  if (result.status === 'fulfilled') return 'ok';
  const error = result.reason as {
    constructor?: { name: string };
    code?: string;
    driverError?: { code?: string };
  };
  if (error instanceof HttpException) return String(error.getStatus());
  return `${error?.constructor?.name}(${error?.driverError?.code ?? error?.code ?? '-'})`;
};

describe('Lock order of groom paths under concurrent transactions (Postgres)', () => {
  let db: TestPostgres;
  let dataSource: DataSource;
  let seed: ReturnType<typeof fixtures>;
  let sessions: TrainingSessionsService;
  let enrollments: TrainingClassEnrollmentsService;
  let grooms: GroomAssignmentsService;
  let trainer: Actor;
  let barnId: string;
  let classId: string;

  beforeAll(async () => {
    db = await startTestPostgres();
    dataSource = db.dataSource;
    seed = fixtures(dataSource);
    const events = new DomainEventPublisher();
    const access = new TrainingAccessService(
      dataSource,
      new HorseAccessService(dataSource),
    );
    const facade = new TrainingOperationsFacade(access);
    sessions = new TrainingSessionsService(
      dataSource.getRepository(TrainingSessionEntity),
      access,
      dataSource,
      new AuditService(),
      events,
    );
    enrollments = new TrainingClassEnrollmentsService(
      dataSource.getRepository(HorseEnrollmentEntity),
      access,
      facade,
      dataSource,
      {
        signDownloadUrls: () => Promise.resolve(new Map()),
      } as unknown as MediaService,
      new AuditService(),
    );
    grooms = new GroomAssignmentsService(
      dataSource.getRepository(GroomAssignmentEntity),
      dataSource,
      new AuditService(),
      events,
      new StableAccessService(new HorseAccessService(dataSource)),
      new HorseAccessService(dataSource),
      new DailyChecklistsService(events),
      facade,
      new GroomAssignmentsRepository(dataSource),
    );
  });

  afterAll(() => stopTestPostgres(db));

  beforeEach(async () => {
    await truncateAllTables(dataSource);
    const trainerId = await seed.user(UserRole.HEAD_TRAINER);
    const [row] = await dataSource.query<Array<{ keycloak_id: string }>>(
      'SELECT keycloak_id FROM users WHERE id = $1',
      [trainerId],
    );
    trainer = { sub: row.keycloak_id, roles: [UserRole.HEAD_TRAINER] };
    barnId = await seed.barn('Khu A');
    await dataSource.query(
      'UPDATE barns SET head_trainer_id = $1 WHERE id = $2',
      [trainerId, barnId],
    );
    ({ classId } = await seed.trainingClass(trainerId, {
      startDate: '2026-01-01',
      endDate: '2030-12-31',
    }));
  });

  const waitBlocked = async (count: number) => {
    for (let i = 0; i < 300; i++) {
      const [row] = await dataSource.query<{ n: number }[]>(
        `SELECT count(*)::int AS n FROM pg_stat_activity
          WHERE datname = current_database() AND wait_event_type = 'Lock'`,
      );
      if (row.n >= count) return;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    throw new Error(
      `setup: expected ${count} transaction(s) waiting on a lock`,
    );
  };

  const contendOnHorse = async (
    horseId: string,
    steps: Array<() => Promise<unknown>>,
  ): Promise<string[]> => {
    const holder = dataSource.createQueryRunner();
    await holder.connect();
    await holder.startTransaction();
    await holder.query('SELECT 1 FROM horses WHERE id = $1 FOR UPDATE', [
      horseId,
    ]);
    const running: Promise<unknown>[] = [];
    try {
      for (const step of steps) {
        running.push(step());
        await waitBlocked(running.length);
      }
    } finally {
      await holder.rollbackTransaction();
      await holder.release();
    }
    return (await Promise.allSettled(running)).map(outcomeOf);
  };

  const groomedHorse = async (name: string) => {
    const groomId = await seed.user(UserRole.GROOM);
    const horseId = await seed.horse(name, { barnId });
    await dataSource.query(
      `INSERT INTO groom_assignments (version, horse_id, groom_id, start_at)
       VALUES (1, $1, $2, '2026-01-01T00:00:00Z')`,
      [horseId, groomId],
    );
    return { horseId, groomId };
  };

  const subjectId = async () =>
    (
      await dataSource.query<Array<{ subject_id: string }>>(
        `SELECT s.subject_id FROM training_class_phase_subjects s
           JOIN training_class_phases p ON p.id = s.phase_id
          WHERE p.class_id = $1`,
        [classId],
      )
    )[0].subject_id;

  it('adding a session (horse → groom) while the head trainer re-assigns the groom of one of its horses: no deadlock 40P01', async () => {
    const rounds: string[][] = [];
    for (let i = 0; i < ROUNDS; i++) {
      const { horseId, groomId } = await groomedHorse(`Thêm ${i}`);
      await dataSource.query(
        `INSERT INTO horse_enrollments (version, class_id, horse_id, status, enrolled_at)
         VALUES (1, $1, $2, 'ACTIVE', '2026-01-01T00:00:00Z')`,
        [classId, horseId],
      );
      const start = Date.parse('2030-01-10T01:00:00Z') + i * 86_400_000;
      const body = {
        subjectId: await subjectId(),
        name: `Buổi ${i}`,
        sessionType: TrainingSessionType.REGULAR,
        intensity: TrainingIntensity.LIGHT,
        plannedDistanceM: 3000,
        scheduledStartAt: new Date(start).toISOString(),
        scheduledEndAt: new Date(start + 3_600_000).toISOString(),
      };
      rounds.push(
        await contendOnHorse(horseId, [
          () => sessions.createSession(trainer, classId, body),
          () => grooms.assign(trainer, horseId, { groomId }),
        ]),
      );
    }

    expect(rounds).toEqual(Array(ROUNDS).fill(['ok', 'ok']));
  });

  it('enrolling a horse (horse → groom) while the head trainer re-assigns its groom: no deadlock 40P01', async () => {
    const start = Date.parse('2030-01-10T01:00:00Z');
    await dataSource.query(
      `INSERT INTO training_sessions (version, class_id, name, scheduled_start_at, scheduled_end_at, status, intensity, planned_distance_m)
       VALUES (1, $1, 'Buổi', $2, $3, 'SCHEDULED', 'LIGHT', 3000)`,
      [classId, new Date(start), new Date(start + 3_600_000)],
    );
    const rounds: string[][] = [];
    for (let i = 0; i < ROUNDS; i++) {
      const { horseId, groomId } = await groomedHorse(`Ghi ${i}`);
      rounds.push(
        await contendOnHorse(horseId, [
          () => enrollments.create(trainer, classId, { horseId }),
          () => grooms.assign(trainer, horseId, { groomId }),
        ]),
      );
    }

    expect(rounds).toEqual(Array(ROUNDS).fill(['ok', 'ok']));
  });
});

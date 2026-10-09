import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { UserRole } from '../../src/common/enums/role.enum';
import type { Actor } from '../../src/common/types/actor';
import { HorseAccessService } from '../../src/modules/horses/shared/horse-access.service';
import { HorseHealthStatus } from '../../src/modules/horses/enums/horse-status.enum';
import { TrainingSessionEntity } from '../../src/modules/training/entities/training-session.entity';
import { TrainingAccessService } from '../../src/modules/training/shared/training-access.service';
import { TrainingSessionsService } from '../../src/modules/training/training-sessions/training-sessions.service';
import { fixtures } from './fixtures';
import {
  startTestPostgres,
  stopTestPostgres,
  truncateAllTables,
  type TestPostgres,
} from './postgres';

describe('TrainingSessionsService publishing (Postgres)', () => {
  let db: TestPostgres;
  let dataSource: DataSource;
  let seed: ReturnType<typeof fixtures>;
  let service: TrainingSessionsService;
  let trainer: Actor;
  let classId: string;
  let barnId: string;

  beforeAll(async () => {
    db = await startTestPostgres();
    dataSource = db.dataSource;
    seed = fixtures(dataSource);
    service = new TrainingSessionsService(
      dataSource.getRepository(TrainingSessionEntity),
      new TrainingAccessService(dataSource, new HorseAccessService(dataSource)),
      dataSource,
    );
  });

  afterAll(() => stopTestPostgres(db));

  const actorOf = async (id: string, role: UserRole): Promise<Actor> => {
    const [row] = await dataSource.query<Array<{ keycloak_id: string }>>(
      'SELECT keycloak_id FROM users WHERE id = $1',
      [id],
    );
    return { sub: row.keycloak_id, roles: [role] };
  };

  beforeEach(async () => {
    await truncateAllTables(dataSource);
    const trainerId = await seed.user(UserRole.HEAD_TRAINER);
    trainer = await actorOf(trainerId, UserRole.HEAD_TRAINER);
    barnId = await seed.barn('Khu A');
    await dataSource.query(
      'UPDATE barns SET head_trainer_id = $1 WHERE id = $2',
      [trainerId, barnId],
    );
    ({ classId } = await seed.trainingClass(trainerId, {
      startDate: '2026-10-01',
      endDate: '2026-12-31',
    }));
  });

  const enroll = async (
    name: string,
    health = HorseHealthStatus.ELIGIBLE,
  ): Promise<string> => {
    const horse = await seed.horse(name, { barnId, health });
    await dataSource.query(
      `INSERT INTO horse_enrollments (id, version, class_id, horse_id, status, enrolled_at)
       VALUES ($1, 1, $2, $3, 'ACTIVE', '2026-10-01T00:00:00Z')`,
      [randomUUID(), classId, horse],
    );
    return horse;
  };

  const draft = async (
    startAt: string,
    options: { type?: string; intensity?: string; trial?: boolean } = {},
  ): Promise<string> => {
    const id = randomUUID();
    await dataSource.query(
      `INSERT INTO training_sessions (id, version, class_id, name, session_type, scheduled_start_at, scheduled_end_at, status, intensity, planned_distance_m)
       VALUES ($1, 1, $2, 'Buổi', $3, $4::timestamptz, $4::timestamptz + interval '1 hour', 'DRAFT', $5, 3000)`,
      [
        id,
        classId,
        options.type ?? 'REGULAR',
        startAt,
        options.intensity ?? 'MODERATE',
      ],
    );
    if (options.trial) {
      await dataSource.query(
        `INSERT INTO time_trials (id, version, session_id, distance_m)
         VALUES ($1, 1, $2, 1200)`,
        [randomUUID(), id],
      );
    }
    return id;
  };

  const participantsOf = (sessionId: string) =>
    dataSource.query<Array<{ horse_id: string; status: string }>>(
      'SELECT horse_id, status FROM session_participants WHERE session_id = $1 ORDER BY horse_id',
      [sessionId],
    );

  describe('one session', () => {
    it('schedules the session and plans every enrolled horse with its eligibility', async () => {
      const healthy = await enroll('Winx');
      const watched = await enroll('Gió', HorseHealthStatus.UNDER_OBSERVATION);
      const session = await draft('2026-10-10T01:00:00Z', {
        intensity: 'HEAVY',
      });

      const result = await service.publishSession(trainer, session);

      expect(result.status).toBe('SCHEDULED');
      const rows = await participantsOf(session);
      expect(
        Object.fromEntries(rows.map((r) => [r.horse_id, r.status])),
      ).toEqual({
        [healthy]: 'PLANNED',
        [watched]: 'INELIGIBLE',
      });
    });

    it('refuses a time trial session without its time trial config', async () => {
      const session = await draft('2026-10-10T01:00:00Z', {
        type: 'TIME_TRIAL',
      });

      await expect(service.publishSession(trainer, session)).rejects.toThrow(
        new ConflictException(
          'Buổi chạy thử phải có cấu hình chạy thử trước khi công bố',
        ),
      );
    });

    it('refuses a session of a class that is not active', async () => {
      const session = await draft('2026-10-10T01:00:00Z');
      await dataSource.query(
        "UPDATE training_classes SET status = 'DRAFT' WHERE id = $1",
        [classId],
      );

      await expect(service.publishSession(trainer, session)).rejects.toThrow(
        new ConflictException('Lớp không còn ở trạng thái đang chạy'),
      );
    });
  });

  describe('many sessions', () => {
    it('publishes every draft session of the class in time order', async () => {
      await enroll('Winx');
      const later = await draft('2026-10-12T01:00:00Z');
      const sooner = await draft('2026-10-10T01:00:00Z', {
        type: 'TIME_TRIAL',
        trial: true,
      });

      const result = await service.publishClassSessions(trainer, classId, {});

      expect(result.map((row) => row.id)).toEqual([sooner, later]);
      expect(await participantsOf(later)).toHaveLength(1);
    });

    it('publishes only sessions whose club day is inside the range', async () => {
      const first = await draft('2026-10-04T23:00:00Z');
      await draft('2026-10-12T01:00:00Z');

      const result = await service.publishClassSessions(trainer, classId, {
        from: '2026-10-05',
        to: '2026-10-11',
      });

      expect(result.map((row) => row.id)).toEqual([first]);
    });

    it('publishes nothing when one session cannot be published', async () => {
      const ok = await draft('2026-10-10T01:00:00Z');
      await draft('2026-10-11T01:00:00Z', { type: 'TIME_TRIAL' });

      await expect(
        service.publishClassSessions(trainer, classId, {}),
      ).rejects.toThrow(ConflictException);
      const [row] = await dataSource.query<Array<{ status: string }>>(
        'SELECT status FROM training_sessions WHERE id = $1',
        [ok],
      );
      expect(row.status).toBe('DRAFT');
    });

    it('rejects a range that ends before it starts', async () => {
      await expect(
        service.publishClassSessions(trainer, classId, {
          from: '2026-10-11',
          to: '2026-10-05',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('forbids another head trainer', async () => {
      await draft('2026-10-10T01:00:00Z');
      const other = await actorOf(
        await seed.user(UserRole.HEAD_TRAINER),
        UserRole.HEAD_TRAINER,
      );

      await expect(
        service.publishClassSessions(other, classId, {}),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});

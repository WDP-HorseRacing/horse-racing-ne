import { ConflictException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { UserRole } from '../../src/common/enums/role.enum';
import type { Actor } from '../../src/common/types/actor';
import { HorseAccessService } from '../../src/modules/horses/shared/horse-access.service';
import { TrainingIntensity } from '../../src/modules/training/enums/training-intensity.enum';
import { TrainingSessionType } from '../../src/modules/training/enums/training-session-type.enum';
import { HorseEnrollmentEntity } from '../../src/modules/training/entities/horse-enrollment.entity';
import { TrainingSessionEntity } from '../../src/modules/training/entities/training-session.entity';
import { TrainingAccessService } from '../../src/modules/training/shared/training-access.service';
import { TrainingOperationsFacade } from '../../src/modules/training/shared/training-operations.facade';
import { TrainingClassEnrollmentsService } from '../../src/modules/training/training-classes/services/training-class-enrollments.service';
import { TrainingSessionsService } from '../../src/modules/training/training-sessions/training-sessions.service';
import { MediaService } from '../../src/modules/media/services/media.service';
import { fixtures } from './fixtures';
import {
  startTestPostgres,
  stopTestPostgres,
  truncateAllTables,
  type TestPostgres,
} from './postgres';

describe('Overlapping training sessions of a horse (Postgres)', () => {
  let db: TestPostgres;
  let dataSource: DataSource;
  let seed: ReturnType<typeof fixtures>;
  let sessions: TrainingSessionsService;
  let enrollments: TrainingClassEnrollmentsService;
  let trainer: Actor;
  let barnId: string;
  let classA: string;
  let classB: string;
  let classC: string;

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
    );
    enrollments = new TrainingClassEnrollmentsService(
      dataSource.getRepository(HorseEnrollmentEntity),
      access,
      new TrainingOperationsFacade(),
      dataSource,
      {
        signDownloadUrls: () => Promise.resolve(new Map()),
      } as unknown as MediaService,
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
    const dates = { startDate: '2026-01-01', endDate: '2030-12-31' };
    ({ classId: classA } = await seed.trainingClass(trainerId, {
      ...dates,
      code: 'A',
    }));
    ({ classId: classB } = await seed.trainingClass(trainerId, {
      ...dates,
      code: 'B',
    }));
    ({ classId: classC } = await seed.trainingClass(trainerId, {
      ...dates,
      code: 'C',
    }));
  });

  const session = async (
    classId: string,
    start: string,
    end: string,
    status = 'SCHEDULED',
  ) => {
    const id = randomUUID();
    await dataSource.query(
      `INSERT INTO training_sessions (id, version, class_id, name, scheduled_start_at, scheduled_end_at, status, intensity, planned_distance_m)
       VALUES ($1, 1, $2, 'Buổi', $3, $4, $5, 'MODERATE', 3000)`,
      [id, classId, start, end, status],
    );
    return id;
  };

  const enroll = async (classId: string, horseId: string) => {
    const id = randomUUID();
    await dataSource.query(
      `INSERT INTO horse_enrollments (id, version, class_id, horse_id, status, enrolled_at)
       VALUES ($1, 1, $2, $3, 'ACTIVE', '2026-01-01T00:00:00Z')`,
      [id, classId, horseId],
    );
    return id;
  };

  const leftEnrollment = (classId: string, horseId: string, leftAt: string) =>
    dataSource.query(
      `INSERT INTO horse_enrollments (id, version, class_id, horse_id, status, enrolled_at, left_at)
       VALUES ($1, 1, $2, $3, 'LEFT', '2026-01-01T00:00:00Z', $4)`,
      [randomUUID(), classId, horseId, leftAt],
    );

  const hold = async (
    horseId: string,
    start: string,
    end: string,
    participantStatus = 'PLANNED',
  ) => {
    const enrollmentId = await enroll(classB, horseId);
    const sessionId = await session(classB, start, end);
    await dataSource.query(
      `INSERT INTO session_participants (id, version, session_id, horse_id, horse_enrollment_id, status)
       VALUES ($1, 1, $2, $3, $4, $5)`,
      [randomUUID(), sessionId, horseId, enrollmentId, participantStatus],
    );
    return sessionId;
  };

  const participantsOf = (sessionId: string) =>
    dataSource.query<Array<{ horse_id: string }>>(
      'SELECT horse_id FROM session_participants WHERE session_id = $1',
      [sessionId],
    );

  const newSession = async (start: string, end: string) => ({
    subjectId: (
      await dataSource.query<Array<{ id: string }>>(
        'SELECT id FROM training_subjects LIMIT 1',
      )
    )[0].id,
    name: 'Buổi mới',
    sessionType: TrainingSessionType.REGULAR,
    intensity: TrainingIntensity.MODERATE,
    plannedDistanceM: 3000,
    scheduledStartAt: start,
    scheduledEndAt: end,
  });

  describe('sessions of the same class', () => {
    it('refuses adding a session overlapping another one, with its club time', async () => {
      await session(classA, '2030-01-10T01:00:00Z', '2030-01-10T02:00:00Z');

      await expect(
        sessions.createSession(
          trainer,
          classA,
          await newSession('2030-01-10T01:30:00Z', '2030-01-10T02:30:00Z'),
        ),
      ).rejects.toThrow(
        new ConflictException(
          'Trùng giờ với buổi tập lúc 08:00 ngày 10/01/2030 của lớp',
        ),
      );
    });

    it('accepts a session touching the edge or overlapping a cancelled one', async () => {
      await session(classA, '2030-01-10T01:00:00Z', '2030-01-10T02:00:00Z');
      await session(
        classA,
        '2030-01-10T02:00:00Z',
        '2030-01-10T03:00:00Z',
        'CANCELLED',
      );

      const created = await sessions.createSession(
        trainer,
        classA,
        await newSession('2030-01-10T02:00:00Z', '2030-01-10T03:00:00Z'),
      );

      expect(created.status).toBe('DRAFT');
    });

    it('refuses moving a session onto another one of the class', async () => {
      await session(classA, '2030-01-10T01:00:00Z', '2030-01-10T02:00:00Z');
      const moved = await session(
        classA,
        '2030-01-11T01:00:00Z',
        '2030-01-11T02:00:00Z',
        'DRAFT',
      );

      await expect(
        sessions.updateSession(trainer, moved, {
          scheduledStartAt: '2030-01-10T01:45:00Z',
          scheduledEndAt: '2030-01-10T02:45:00Z',
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('enrolling a horse', () => {
    it('refuses the whole enrollment when the horse holds an overlapping session in another class', async () => {
      const winx = await seed.horse('Winx', { barnId });
      await hold(winx, '2030-01-10T01:30:00Z', '2030-01-10T02:30:00Z');
      await session(classA, '2030-01-09T01:00:00Z', '2030-01-09T02:00:00Z');
      await session(classA, '2030-01-10T01:00:00Z', '2030-01-10T02:00:00Z');

      await expect(
        enrollments.create(trainer, classA, { horseId: winx }),
      ).rejects.toThrow(
        new ConflictException('Ngựa Winx đã có buổi tập trùng giờ ở lớp B'),
      );
      const [{ count }] = await dataSource.query<Array<{ count: string }>>(
        'SELECT count(*) FROM horse_enrollments WHERE class_id = $1',
        [classA],
      );
      expect(count).toBe('0');
    });

    it('ignores participants that no longer hold a seat', async () => {
      const winx = await seed.horse('Winx', { barnId });
      await hold(
        winx,
        '2030-01-10T01:30:00Z',
        '2030-01-10T02:30:00Z',
        'CANCELLED',
      );
      await dataSource.query(
        `UPDATE horse_enrollments SET status = 'LEFT', left_at = '2026-06-01T00:00:00Z'
          WHERE class_id = $1 AND horse_id = $2`,
        [classB, winx],
      );
      const sessionA = await session(
        classA,
        '2030-01-10T01:00:00Z',
        '2030-01-10T02:00:00Z',
      );

      await enrollments.create(trainer, classA, { horseId: winx });

      expect(await participantsOf(sessionA)).toEqual([{ horse_id: winx }]);
    });
  });

  describe('schedule of a horse across classes', () => {
    it('refuses enrolling a horse whose draft sessions overlap its draft sessions in another class', async () => {
      const winx = await seed.horse('Winx', { barnId });
      await session(
        classA,
        '2030-01-10T01:00:00Z',
        '2030-01-10T02:00:00Z',
        'DRAFT',
      );
      await session(
        classB,
        '2030-01-10T01:30:00Z',
        '2030-01-10T02:30:00Z',
        'DRAFT',
      );
      await enrollments.create(trainer, classA, { horseId: winx });

      await expect(
        enrollments.create(trainer, classB, { horseId: winx }),
      ).rejects.toThrow(
        new ConflictException('Ngựa Winx đã có buổi tập trùng giờ ở lớp A'),
      );
      const [{ count }] = await dataSource.query<Array<{ count: string }>>(
        'SELECT count(*) FROM horse_enrollments WHERE class_id = $1',
        [classB],
      );
      expect(count).toBe('0');
    });

    it('refuses adding a session that overlaps the schedule of horses in other classes, listing every horse', async () => {
      const winx = await seed.horse('Winx', { barnId });
      const blue = await seed.horse('Blue', { barnId });
      const free = await seed.horse('Free', { barnId });
      await enroll(classA, winx);
      await enroll(classB, winx);
      await enroll(classC, blue);
      await enroll(classB, blue);
      await enroll(classB, free);
      await session(
        classA,
        '2030-01-10T01:00:00Z',
        '2030-01-10T02:00:00Z',
        'DRAFT',
      );
      await session(classC, '2030-01-10T01:30:00Z', '2030-01-10T02:30:00Z');

      await expect(
        sessions.createSession(
          trainer,
          classB,
          await newSession('2030-01-10T01:15:00Z', '2030-01-10T02:15:00Z'),
        ),
      ).rejects.toThrow(
        new ConflictException(
          'Trùng giờ với lịch của ngựa: Blue (lớp C, 08:30 ngày 10/01/2030), Winx (lớp A, 08:00 ngày 10/01/2030)',
        ),
      );
    });

    it('lets only one of two concurrent overlapping sessions of a shared horse through', async () => {
      const winx = await seed.horse('Winx', { barnId });
      await enroll(classA, winx);
      await enroll(classB, winx);

      for (let day = 10; day < 20; day++) {
        const results = await Promise.allSettled([
          sessions.createSession(
            trainer,
            classA,
            await newSession(
              `2030-01-${day}T01:00:00Z`,
              `2030-01-${day}T02:00:00Z`,
            ),
          ),
          sessions.createSession(
            trainer,
            classB,
            await newSession(
              `2030-01-${day}T01:30:00Z`,
              `2030-01-${day}T02:30:00Z`,
            ),
          ),
        ]);

        expect(results.map((result) => result.status).sort()).toEqual([
          'fulfilled',
          'rejected',
        ]);
      }
    });

    it('refuses adding a session overlapping a seat the horse holds in another class', async () => {
      const winx = await seed.horse('Winx', { barnId });
      await enroll(classA, winx);
      await hold(winx, '2026-02-01T01:00:00Z', '2026-02-01T02:00:00Z');

      await expect(
        sessions.createSession(
          trainer,
          classA,
          await newSession('2026-02-01T01:30:00Z', '2026-02-01T02:30:00Z'),
        ),
      ).rejects.toThrow(
        new ConflictException(
          'Trùng giờ với lịch của ngựa: Winx (lớp B, 08:00 ngày 01/02/2026)',
        ),
      );
    });

    it('refuses moving a draft session onto the schedule of a horse in another class', async () => {
      const winx = await seed.horse('Winx', { barnId });
      await enroll(classA, winx);
      await enroll(classB, winx);
      await session(
        classA,
        '2030-01-10T01:00:00Z',
        '2030-01-10T02:00:00Z',
        'DRAFT',
      );
      const moved = await session(
        classB,
        '2030-01-11T01:00:00Z',
        '2030-01-11T02:00:00Z',
        'DRAFT',
      );

      await expect(
        sessions.updateSession(trainer, moved, {
          scheduledStartAt: '2030-01-10T01:45:00Z',
          scheduledEndAt: '2030-01-10T02:45:00Z',
        }),
      ).rejects.toThrow(
        new ConflictException(
          'Trùng giờ với lịch của ngựa: Winx (lớp A, 08:00 ngày 10/01/2030)',
        ),
      );
    });

    it('ignores the other class once the horse left it before the session', async () => {
      const winx = await seed.horse('Winx', { barnId });
      await leftEnrollment(classA, winx, '2030-01-01T00:00:00Z');
      await enroll(classB, winx);
      await session(
        classA,
        '2030-01-10T01:00:00Z',
        '2030-01-10T02:00:00Z',
        'DRAFT',
      );

      const created = await sessions.createSession(
        trainer,
        classB,
        await newSession('2030-01-10T01:00:00Z', '2030-01-10T02:00:00Z'),
      );

      expect(created.status).toBe('DRAFT');
    });

    it('ignores a horse that left this class before the new session', async () => {
      const winx = await seed.horse('Winx', { barnId });
      await enroll(classA, winx);
      await leftEnrollment(classB, winx, '2030-01-01T00:00:00Z');
      await session(
        classA,
        '2030-01-10T01:00:00Z',
        '2030-01-10T02:00:00Z',
        'DRAFT',
      );

      const created = await sessions.createSession(
        trainer,
        classB,
        await newSession('2030-01-10T01:00:00Z', '2030-01-10T02:00:00Z'),
      );

      expect(created.status).toBe('DRAFT');
    });

    it('ignores cancelled, completed and past sessions in the other class', async () => {
      const winx = await seed.horse('Winx', { barnId });
      await enroll(classA, winx);
      await enroll(classB, winx);
      await session(
        classA,
        '2030-01-10T01:00:00Z',
        '2030-01-10T02:00:00Z',
        'CANCELLED',
      );
      await session(
        classA,
        '2030-01-11T01:00:00Z',
        '2030-01-11T02:00:00Z',
        'COMPLETED',
      );
      await session(
        classA,
        '2026-02-01T01:00:00Z',
        '2026-02-01T02:00:00Z',
        'DRAFT',
      );

      for (const [start, end] of [
        ['2030-01-10T01:00:00Z', '2030-01-10T02:00:00Z'],
        ['2030-01-11T01:00:00Z', '2030-01-11T02:00:00Z'],
        ['2026-02-01T01:00:00Z', '2026-02-01T02:00:00Z'],
      ]) {
        const created = await sessions.createSession(
          trainer,
          classB,
          await newSession(start, end),
        );
        expect(created.status).toBe('DRAFT');
      }
    });
  });

  describe('publishing', () => {
    it('skips a horse holding an overlapping session, even INELIGIBLE, and plans the others', async () => {
      const winx = await seed.horse('Winx', { barnId });
      const blue = await seed.horse('Blue', { barnId });
      await enroll(classA, winx);
      await enroll(classA, blue);
      await hold(
        winx,
        '2030-01-10T01:30:00Z',
        '2030-01-10T02:30:00Z',
        'INELIGIBLE',
      );
      const draft = await session(
        classA,
        '2030-01-10T01:00:00Z',
        '2030-01-10T02:00:00Z',
        'DRAFT',
      );

      const result = await sessions.publishSession(trainer, draft);

      expect(result.status).toBe('SCHEDULED');
      expect(result.skippedHorses).toEqual([
        {
          horseId: winx,
          horseName: 'Winx',
          conflictClassCode: 'B',
          conflictStartAt: new Date('2030-01-10T01:30:00Z'),
        },
      ]);
      expect(await participantsOf(draft)).toEqual([{ horse_id: blue }]);
    });

    it('plans a horse whose other session only touches the edge', async () => {
      const winx = await seed.horse('Winx', { barnId });
      await enroll(classA, winx);
      await hold(winx, '2030-01-10T00:00:00Z', '2030-01-10T01:00:00Z');
      const draft = await session(
        classA,
        '2030-01-10T01:00:00Z',
        '2030-01-10T02:00:00Z',
        'DRAFT',
      );

      const result = await sessions.publishSession(trainer, draft);

      expect(result.skippedHorses).toEqual([]);
      expect(await participantsOf(draft)).toEqual([{ horse_id: winx }]);
    });

    it('reports skipped horses per session when publishing many sessions', async () => {
      const winx = await seed.horse('Winx', { barnId });
      await enroll(classA, winx);
      await hold(winx, '2030-01-10T01:30:00Z', '2030-01-10T02:30:00Z');
      const clashing = await session(
        classA,
        '2030-01-10T01:00:00Z',
        '2030-01-10T02:00:00Z',
        'DRAFT',
      );
      const free = await session(
        classA,
        '2030-01-11T01:00:00Z',
        '2030-01-11T02:00:00Z',
        'DRAFT',
      );

      const result = await sessions.publishClassSessions(trainer, classA, {});

      expect(result.map((row) => [row.id, row.skippedHorses.length])).toEqual([
        [clashing, 1],
        [free, 0],
      ]);
      expect(await participantsOf(clashing)).toEqual([]);
      expect(await participantsOf(free)).toEqual([{ horse_id: winx }]);
    });
  });
});

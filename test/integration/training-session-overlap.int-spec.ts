import { ConflictException, ForbiddenException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { UserRole } from '../../src/common/enums/role.enum';
import type { Actor } from '../../src/common/types/actor';
import { HorseLifecycleStatus } from '../../src/modules/horses/enums/horse-status.enum';
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
import { AuditService } from '../../src/modules/audit/services/audit.service';

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
      new AuditService(),
    );
    enrollments = new TrainingClassEnrollmentsService(
      dataSource.getRepository(HorseEnrollmentEntity),
      access,
      new TrainingOperationsFacade(),
      dataSource,
      {
        signDownloadUrls: () => Promise.resolve(new Map()),
      } as unknown as MediaService,
      new AuditService(),
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
       VALUES ($1, 1, $2, 'Buổi', $3, $4, $5, 'LIGHT', 3000)`,
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

  const newSession = async (classId: string, start: string, end: string) => ({
    subjectId: (
      await dataSource.query<Array<{ subject_id: string }>>(
        `SELECT s.subject_id FROM training_class_phase_subjects s
           JOIN training_class_phases p ON p.id = s.phase_id
          WHERE p.class_id = $1`,
        [classId],
      )
    )[0].subject_id,
    name: 'Buổi mới',
    sessionType: TrainingSessionType.REGULAR,
    intensity: TrainingIntensity.LIGHT,
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
          await newSession(
            classA,
            '2030-01-10T01:30:00Z',
            '2030-01-10T02:30:00Z',
          ),
        ),
      ).rejects.toThrow(
        new ConflictException(
          'Trùng giờ với buổi tập lúc 08:00 ngày 10/01/2030 của lớp',
        ),
      );
    });

    it('accepts a session overlapping a cancelled one, 3 hours after the previous one', async () => {
      await session(classA, '2030-01-10T01:00:00Z', '2030-01-10T02:00:00Z');
      await session(
        classA,
        '2030-01-10T05:00:00Z',
        '2030-01-10T06:00:00Z',
        'CANCELLED',
      );

      const created = await sessions.createSession(
        trainer,
        classA,
        await newSession(
          classA,
          '2030-01-10T05:00:00Z',
          '2030-01-10T06:00:00Z',
        ),
      );

      expect(created.status).toBe('SCHEDULED');
    });

    it('refuses a session less than 3 hours after another one of the class', async () => {
      await session(classA, '2030-01-10T01:00:00Z', '2030-01-10T02:00:00Z');

      await expect(
        sessions.createSession(
          trainer,
          classA,
          await newSession(
            classA,
            '2030-01-10T02:00:00Z',
            '2030-01-10T03:00:00Z',
          ),
        ),
      ).rejects.toThrow(
        new ConflictException(
          'Buổi vượt giới hạn tập trong ngày của lớp: chưa nghỉ đủ 3 giờ so với buổi khác (lớp A, 08:00 ngày 10/01/2030)',
        ),
      );
    });

    it('refuses moving a session onto another one of the class', async () => {
      await session(classA, '2030-01-10T01:00:00Z', '2030-01-10T02:00:00Z');
      const moved = await session(
        classA,
        '2030-01-11T01:00:00Z',
        '2030-01-11T02:00:00Z',
        'SCHEDULED',
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

  describe('horses that can be enrolled', () => {
    it('lists active horses of the trainer barns, without enrolled or clashing ones, by name', async () => {
      const held = await seed.horse('Held', { barnId });
      await hold(held, '2030-01-10T01:30:00Z', '2030-01-10T02:30:00Z');
      const planned = await seed.horse('Planned', { barnId });
      await enroll(classC, planned);
      await session(
        classC,
        '2030-01-11T01:30:00Z',
        '2030-01-11T02:30:00Z',
        'SCHEDULED',
      );
      await session(classA, '2030-01-10T01:00:00Z', '2030-01-10T02:00:00Z');
      await session(
        classA,
        '2030-01-11T01:00:00Z',
        '2030-01-11T02:00:00Z',
        'SCHEDULED',
      );
      await enroll(classA, await seed.horse('Enrolled', { barnId }));
      await leftEnrollment(
        classA,
        await seed.horse('Left', { barnId }),
        '2026-06-01T00:00:00Z',
      );
      await seed.horse('Free', { barnId });
      await seed.horse('Retired', {
        barnId,
        lifecycle: HorseLifecycleStatus.RETIRED,
      });
      await seed.horse('Deleted', { barnId, deleted: true });
      await seed.horse('Elsewhere', { barnId: await seed.barn('Khu B') });

      const rows = await enrollments.listEnrollableHorses(trainer, classA);

      expect(rows.map((row) => row.horseName)).toEqual(['Free', 'Left']);
      expect(rows[0]).toMatchObject({ horseName: 'Free', horsePhotoUrl: null });
      expect(Object.keys(rows[0]).sort()).toEqual([
        'horseId',
        'horseName',
        'horsePhotoUrl',
      ]);
      for (const row of rows) {
        await expect(
          enrollments.create(trainer, classA, { horseId: row.horseId }),
        ).resolves.toBeDefined();
      }
      for (const horseId of [held, planned]) {
        await expect(
          enrollments.create(trainer, classA, { horseId }),
        ).rejects.toThrow(ConflictException);
      }
    });

    it('refuses another head trainer and a class that is not running', async () => {
      const otherId = await seed.user(UserRole.HEAD_TRAINER);
      const [row] = await dataSource.query<Array<{ keycloak_id: string }>>(
        'SELECT keycloak_id FROM users WHERE id = $1',
        [otherId],
      );
      await expect(
        enrollments.listEnrollableHorses(
          { sub: row.keycloak_id, roles: [UserRole.HEAD_TRAINER] },
          classA,
        ),
      ).rejects.toThrow(ForbiddenException);
      await dataSource.query(
        `UPDATE training_classes SET status = 'COMPLETED' WHERE id = $1`,
        [classA],
      );
      await expect(
        enrollments.listEnrollableHorses(trainer, classA),
      ).rejects.toThrow(
        new ConflictException('Chỉ lớp đang chạy mới nhận thêm ngựa'),
      );
    });
  });

  describe('daily load across classes', () => {
    const heavy = (sessionId: string) =>
      dataSource.query(
        `UPDATE training_sessions SET intensity = 'HEAVY' WHERE id = $1`,
        [sessionId],
      );

    it('refuses enrolling a horse whose HEAVY session elsewhere shares a day with a HEAVY one here, and hides it from the list', async () => {
      const winx = await seed.horse('Winx', { barnId });
      await seed.horse('Free', { barnId });
      await heavy(
        await hold(winx, '2030-01-10T00:00:00Z', '2030-01-10T01:00:00Z'),
      );
      await heavy(
        await session(classA, '2030-01-10T08:00:00Z', '2030-01-10T09:00:00Z'),
      );

      await expect(
        enrollments.listEnrollableHorses(trainer, classA),
      ).resolves.toEqual([expect.objectContaining({ horseName: 'Free' })]);
      await expect(
        enrollments.create(trainer, classA, { horseId: winx }),
      ).rejects.toThrow(
        new ConflictException(
          'Vượt giới hạn tập trong ngày của ngựa: Winx đã có buổi Nặng trong ngày (lớp B, 07:00 ngày 10/01/2030)',
        ),
      );
    });

    it('refuses a second HEAVY session on the same club day of the class, also by changing the intensity', async () => {
      await heavy(
        await session(classA, '2030-01-10T00:00:00Z', '2030-01-10T01:00:00Z'),
      );
      const light = await session(
        classA,
        '2030-01-10T08:00:00Z',
        '2030-01-10T09:00:00Z',
      );

      await expect(
        sessions.updateSession(trainer, light, {
          intensity: TrainingIntensity.HEAVY,
        }),
      ).rejects.toThrow(
        new ConflictException(
          'Buổi vượt giới hạn tập trong ngày của lớp: đã có buổi Nặng trong ngày (lớp A, 07:00 ngày 10/01/2030)',
        ),
      );
      await expect(
        sessions.createSession(trainer, classA, {
          ...(await newSession(
            classA,
            '2030-01-10T14:00:00Z',
            '2030-01-10T15:00:00Z',
          )),
          intensity: TrainingIntensity.LIGHT,
        }),
      ).rejects.toThrow(
        new ConflictException(
          'Buổi vượt giới hạn tập trong ngày của lớp: đã đủ 2 buổi trong ngày (lớp A, 07:00 ngày 10/01/2030)',
        ),
      );
    });
  });

  describe('schedule of a horse across classes', () => {
    it('refuses enrolling a horse whose sessions overlap its sessions in another class', async () => {
      const winx = await seed.horse('Winx', { barnId });
      await session(
        classA,
        '2030-01-10T01:00:00Z',
        '2030-01-10T02:00:00Z',
        'SCHEDULED',
      );
      await session(
        classB,
        '2030-01-10T01:30:00Z',
        '2030-01-10T02:30:00Z',
        'SCHEDULED',
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
        'SCHEDULED',
      );
      await session(classC, '2030-01-10T01:30:00Z', '2030-01-10T02:30:00Z');

      await expect(
        sessions.createSession(
          trainer,
          classB,
          await newSession(
            classB,
            '2030-01-10T01:15:00Z',
            '2030-01-10T02:15:00Z',
          ),
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
              classA,
              `2030-01-${day}T01:00:00Z`,
              `2030-01-${day}T02:00:00Z`,
            ),
          ),
          sessions.createSession(
            trainer,
            classB,
            await newSession(
              classB,
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
          await newSession(
            classA,
            '2026-02-01T01:30:00Z',
            '2026-02-01T02:30:00Z',
          ),
        ),
      ).rejects.toThrow(
        new ConflictException(
          'Trùng giờ với lịch của ngựa: Winx (lớp B, 08:00 ngày 01/02/2026)',
        ),
      );
    });

    it('refuses moving a session onto the schedule of a horse in another class', async () => {
      const winx = await seed.horse('Winx', { barnId });
      await enroll(classA, winx);
      await enroll(classB, winx);
      await session(
        classA,
        '2030-01-10T01:00:00Z',
        '2030-01-10T02:00:00Z',
        'SCHEDULED',
      );
      const moved = await session(
        classB,
        '2030-01-11T01:00:00Z',
        '2030-01-11T02:00:00Z',
        'SCHEDULED',
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
        'SCHEDULED',
      );

      const created = await sessions.createSession(
        trainer,
        classB,
        await newSession(
          classB,
          '2030-01-10T01:00:00Z',
          '2030-01-10T02:00:00Z',
        ),
      );

      expect(created.status).toBe('SCHEDULED');
    });

    it('ignores a horse that left this class before the new session', async () => {
      const winx = await seed.horse('Winx', { barnId });
      await enroll(classA, winx);
      await leftEnrollment(classB, winx, '2030-01-01T00:00:00Z');
      await session(
        classA,
        '2030-01-10T01:00:00Z',
        '2030-01-10T02:00:00Z',
        'SCHEDULED',
      );

      const created = await sessions.createSession(
        trainer,
        classB,
        await newSession(
          classB,
          '2030-01-10T01:00:00Z',
          '2030-01-10T02:00:00Z',
        ),
      );

      expect(created.status).toBe('SCHEDULED');
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
        'SCHEDULED',
      );

      for (const [start, end] of [
        ['2030-01-10T01:00:00Z', '2030-01-10T02:00:00Z'],
        ['2030-01-11T01:00:00Z', '2030-01-11T02:00:00Z'],
        ['2026-02-01T01:00:00Z', '2026-02-01T02:00:00Z'],
      ]) {
        const created = await sessions.createSession(
          trainer,
          classB,
          await newSession(classB, start, end),
        );
        expect(created.status).toBe('SCHEDULED');
      }
    });
  });

  describe('horses of a new session', () => {
    it('plans a horse whose other session ends 3 hours before', async () => {
      const winx = await seed.horse('Winx', { barnId });
      await enroll(classA, winx);
      await hold(winx, '2030-01-09T22:00:00Z', '2030-01-09T23:00:00Z');

      const created = await sessions.createSession(
        trainer,
        classA,
        await newSession(
          classA,
          '2030-01-10T02:00:00Z',
          '2030-01-10T03:00:00Z',
        ),
      );

      expect(await participantsOf(created.id)).toEqual([{ horse_id: winx }]);
    });

    it('refuses a session too close to, or one too many for the day of, a horse schedule in another class', async () => {
      const winx = await seed.horse('Winx', { barnId });
      const blue = await seed.horse('Blue', { barnId });
      await enroll(classA, winx);
      await enroll(classA, blue);
      await hold(winx, '2030-01-10T00:00:00Z', '2030-01-10T01:00:00Z');
      await enroll(classC, blue);
      await session(classC, '2030-01-09T23:00:00Z', '2030-01-10T00:00:00Z');
      await session(classC, '2030-01-10T04:00:00Z', '2030-01-10T05:00:00Z');

      await expect(
        sessions.createSession(
          trainer,
          classA,
          await newSession(
            classA,
            '2030-01-10T09:00:00Z',
            '2030-01-10T10:00:00Z',
          ),
        ),
      ).rejects.toThrow(
        new ConflictException(
          'Vượt giới hạn tập trong ngày của ngựa: Blue đã đủ 2 buổi trong ngày (lớp C, 06:00 ngày 10/01/2030)',
        ),
      );
      await expect(
        sessions.createSession(
          trainer,
          classA,
          await newSession(
            classA,
            '2030-01-10T02:00:00Z',
            '2030-01-10T03:00:00Z',
          ),
        ),
      ).rejects.toThrow(
        /^Vượt giới hạn tập trong ngày của ngựa: Blue .*; Winx chưa nghỉ đủ 3 giờ so với buổi khác \(lớp B, 07:00 ngày 10\/01\/2030\)$/,
      );
    });

    it('refuses a session overlapping a seat the horse holds, even INELIGIBLE', async () => {
      const winx = await seed.horse('Winx', { barnId });
      await enroll(classA, winx);
      await hold(
        winx,
        '2030-01-10T01:30:00Z',
        '2030-01-10T02:30:00Z',
        'INELIGIBLE',
      );

      await expect(
        sessions.createSession(
          trainer,
          classA,
          await newSession(
            classA,
            '2030-01-10T01:00:00Z',
            '2030-01-10T02:00:00Z',
          ),
        ),
      ).rejects.toThrow(ConflictException);
    });
  });
});

import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { UserRole } from '../../src/common/enums/role.enum';
import type { Actor } from '../../src/common/types/actor';
import { HorseAccessService } from '../../src/modules/horses/shared/horse-access.service';
import { HorseEnrollmentEntity } from '../../src/modules/training/entities/horse-enrollment.entity';
import { TrainingAccessService } from '../../src/modules/training/shared/training-access.service';
import { TrainingOperationsFacade } from '../../src/modules/training/shared/training-operations.facade';
import { TrainingClassEnrollmentsService } from '../../src/modules/training/training-classes/services/training-class-enrollments.service';
import { MediaService } from '../../src/modules/media/services/media.service';
import { fixtures } from './fixtures';
import {
  startTestPostgres,
  stopTestPostgres,
  truncateAllTables,
  type TestPostgres,
} from './postgres';

describe('Re-enrolling a horse that left a class (Postgres)', () => {
  let db: TestPostgres;
  let dataSource: DataSource;
  let seed: ReturnType<typeof fixtures>;
  let enrollments: TrainingClassEnrollmentsService;
  let trainer: Actor;
  let barnId: string;
  let classId: string;

  beforeAll(async () => {
    db = await startTestPostgres();
    dataSource = db.dataSource;
    seed = fixtures(dataSource);
    enrollments = new TrainingClassEnrollmentsService(
      dataSource.getRepository(HorseEnrollmentEntity),
      new TrainingAccessService(dataSource, new HorseAccessService(dataSource)),
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
    ({ classId } = await seed.trainingClass(trainerId, {
      startDate: '2026-01-01',
      endDate: '2030-12-31',
      code: 'A',
    }));
  });

  const session = async (start: string, end: string) => {
    const id = randomUUID();
    await dataSource.query(
      `INSERT INTO training_sessions (id, version, class_id, name, scheduled_start_at, scheduled_end_at, status, intensity, planned_distance_m)
       VALUES ($1, 1, $2, 'Buổi', $3, $4, 'SCHEDULED', 'MODERATE', 3000)`,
      [id, classId, start, end],
    );
    return id;
  };

  const participantsOf = (sessionId: string) =>
    dataSource.query<
      Array<{
        id: string;
        horse_enrollment_id: string;
        status: string;
        cancel_reason: string | null;
        checked_in_at: Date | null;
        absence_reason: string | null;
      }>
    >(
      `SELECT id, horse_enrollment_id, status, cancel_reason, checked_in_at, absence_reason
       FROM session_participants WHERE session_id = $1`,
      [sessionId],
    );

  const leave = (enrollmentId: string, reason: string) =>
    dataSource.transaction(async (manager) => {
      const leftAt = new Date();
      await manager.query(
        `UPDATE horse_enrollments SET status = 'LEFT', left_at = $2 WHERE id = $1`,
        [enrollmentId, leftAt],
      );
      await new TrainingOperationsFacade().cancelParticipantsFromEnrollments(
        manager,
        [enrollmentId],
        leftAt,
        reason,
      );
    });

  const reenroll = (horseId: string) =>
    enrollments.create(trainer, classId, {
      horseId,
      enrolledAt: new Date(Date.now() + 1000).toISOString(),
    });

  it('reuses the cancelled participant of a future session and resets it like a new one', async () => {
    const winx = await seed.horse('Winx', { barnId });
    const future = await session(
      '2030-01-10T01:00:00Z',
      '2030-01-10T02:00:00Z',
    );
    const first = await enrollments.create(trainer, classId, { horseId: winx });
    const [before] = await participantsOf(future);
    await leave(first.id, 'Nghỉ tập');
    await dataSource.query(
      `UPDATE session_participants SET checked_in_at = now(), absence_reason = 'cũ' WHERE id = $1`,
      [before.id],
    );
    expect((await participantsOf(future))[0].status).toBe('CANCELLED');

    const second = await reenroll(winx);

    const rows = await participantsOf(future);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: before.id,
      horse_enrollment_id: second.id,
      status: 'PLANNED',
      cancel_reason: null,
      checked_in_at: null,
      absence_reason: null,
    });
  });

  it('leaves sessions already started untouched', async () => {
    const winx = await seed.horse('Winx', { barnId });
    const past = await session('2026-02-01T01:00:00Z', '2026-02-01T02:00:00Z');
    const first = await enrollments.create(trainer, classId, { horseId: winx });
    await leave(first.id, 'Ngựa rời lớp');

    await reenroll(winx);

    expect(await participantsOf(past)).toEqual([]);
  });

  it('keeps a finished participant of a future session as is', async () => {
    const winx = await seed.horse('Winx', { barnId });
    const future = await session(
      '2030-01-10T01:00:00Z',
      '2030-01-10T02:00:00Z',
    );
    const first = await enrollments.create(trainer, classId, { horseId: winx });
    await leave(first.id, 'Ngựa rời lớp');
    await dataSource.query(
      `UPDATE session_participants SET status = 'ABSENT' WHERE session_id = $1`,
      [future],
    );

    await reenroll(winx);

    const rows = await participantsOf(future);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      horse_enrollment_id: first.id,
      status: 'ABSENT',
    });
  });

  describe('leave (service)', () => {
    it('marks the enrollment LEFT and cancels future participants', async () => {
      const winx = await seed.horse('Winx', { barnId });
      const future = await session(
        '2030-01-10T01:00:00Z',
        '2030-01-10T02:00:00Z',
      );
      const first = await enrollments.create(trainer, classId, {
        horseId: winx,
      });

      const left = await enrollments.leave(trainer, first.id, {
        reason: 'Nghỉ tập',
      });

      expect(left).toMatchObject({ id: first.id, status: 'LEFT' });
      expect(left.leftAt).toBeTruthy();
      expect((await participantsOf(future))[0]).toMatchObject({
        status: 'CANCELLED',
        cancel_reason: 'Nghỉ tập',
      });
    });

    it('409 when the horse already left', async () => {
      const winx = await seed.horse('Winx', { barnId });
      const first = await enrollments.create(trainer, classId, {
        horseId: winx,
      });
      await enrollments.leave(trainer, first.id, {});

      await expect(enrollments.leave(trainer, first.id, {})).rejects.toThrow(
        'Ngựa đã rời lớp',
      );
    });

    it('409 when the enrollment does not exist', async () => {
      await expect(
        enrollments.leave(trainer, randomUUID(), {}),
      ).rejects.toThrow('Không tìm thấy ghi danh của ngựa');
    });

    it('409 when leftAt is before enrolledAt', async () => {
      const winx = await seed.horse('Winx', { barnId });
      const first = await enrollments.create(trainer, classId, {
        horseId: winx,
      });

      await expect(
        enrollments.leave(trainer, first.id, {
          leftAt: '2000-01-01T00:00:00Z',
        }),
      ).rejects.toThrow('Thời điểm rời lớp không hợp lệ');
    });

    it('409 when leftAt is after the class end', async () => {
      const winx = await seed.horse('Winx', { barnId });
      const first = await enrollments.create(trainer, classId, {
        horseId: winx,
      });

      await expect(
        enrollments.leave(trainer, first.id, {
          leftAt: '2031-06-01T00:00:00Z',
        }),
      ).rejects.toThrow('Thời điểm rời lớp phải nằm trong thời gian của lớp');
    });
  });
});

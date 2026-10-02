import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { UserRole } from '../../src/common/enums/role.enum';
import { HorseDeletionsService } from '../../src/modules/horses/horse-deletions/horse-deletions.service';
import { HorsePlacementsService } from '../../src/modules/horses/horse-placements/horse-placements.service';
import { HorseProfilesService } from '../../src/modules/horses/horse-profiles/horse-profiles.service';
import { HorseAccessService } from '../../src/modules/horses/shared/horse-access.service';
import { HorseTrainingSessionWhen } from '../../src/modules/training/enums/horse-training-session-when.enum';
import { HorseTrainingRepository } from '../../src/modules/training/horse-training/horse-training.repository';
import { HorseTrainingService } from '../../src/modules/training/horse-training/horse-training.service';
import { fixtures } from './fixtures';
import {
  startTestDatabase,
  stopTestDatabase,
  truncateAll,
  type TestDatabase,
} from './postgres';

const NOW = new Date('2026-10-01T05:00:00Z');

/**
 * Tạo service chỉ gắn DataSource, dùng để gọi thẳng các hàm đọc dữ liệu private của service trên DB thật
 *
 * @param type Class của service
 * @param dataSource DataSource của DB test
 * @returns Service chưa qua constructor, chỉ có field dataSource
 */
function serviceWithDataSource<T>(
  type: abstract new (...args: never[]) => T,
  dataSource: DataSource,
): T {
  return Object.assign(Object.create(type.prototype as object) as T, {
    dataSource,
  });
}

describe('Flow 1 read queries (Postgres)', () => {
  let db: TestDatabase;
  let dataSource: DataSource;
  let seed: ReturnType<typeof fixtures>;
  let profiles: HorseProfilesService;
  let deletions: HorseDeletionsService;
  let placements: HorsePlacementsService;
  let access: HorseAccessService;
  let training: HorseTrainingRepository;
  let trainingService: HorseTrainingService;

  beforeAll(async () => {
    db = await startTestDatabase();
    dataSource = db.dataSource;
    seed = fixtures(dataSource);
    profiles = serviceWithDataSource(HorseProfilesService, dataSource);
    deletions = serviceWithDataSource(HorseDeletionsService, dataSource);
    placements = serviceWithDataSource(HorsePlacementsService, dataSource);
    access = new HorseAccessService(dataSource);
    training = new HorseTrainingRepository(dataSource);
    trainingService = serviceWithDataSource(HorseTrainingService, dataSource);
  });

  afterAll(() => stopTestDatabase(db));

  beforeEach(() => truncateAll(dataSource));

  const softDeleteUser = (id: string) =>
    dataSource.query('UPDATE users SET deleted_at = now() WHERE id = $1', [id]);

  const softDeleteBarn = (id: string) =>
    dataSource.query('UPDATE barns SET deleted_at = now() WHERE id = $1', [id]);

  const setFullName = (id: string, fullName: string) =>
    dataSource.query('UPDATE users SET full_name = $2 WHERE id = $1', [
      id,
      fullName,
    ]);

  const groomAssignment = async (
    horseId: string,
    groomId: string,
    endAt: Date | null,
  ) => {
    await dataSource.query(
      `INSERT INTO groom_assignments (id, version, horse_id, groom_id, start_at, end_at)
       VALUES ($1, 1, $2, $3, $4, $5)`,
      [randomUUID(), horseId, groomId, '2026-09-01T00:00:00Z', endAt],
    );
  };

  const trainingLock = async (horseId: string, status: string) => {
    const vet = await seed.user(UserRole.VETERINARIAN);
    await dataSource.query(
      `INSERT INTO training_locks (id, version, horse_id, locked_by, reason, lock_start, status)
       VALUES ($1, 1, $2, $3, 'Nghỉ', now(), $4)`,
      [randomUUID(), horseId, vet, status],
    );
  };

  const trainingClass = async (
    code: string,
    headTrainerId: string | null,
  ): Promise<string> => {
    const id = randomUUID();
    await dataSource.query(
      `INSERT INTO training_classes (id, version, name, code, head_trainer_id, start_date, end_date, status)
       VALUES ($1, 1, $2, $3, $4, '2026-09-01', '2026-12-31', 'ACTIVE')`,
      [id, `Lớp ${code}`, code, headTrainerId],
    );
    return id;
  };

  const enrollment = async (
    classId: string,
    horseId: string,
    status: string,
    enrolledAt: string,
  ): Promise<string> => {
    const id = randomUUID();
    await dataSource.query(
      `INSERT INTO horse_enrollments (id, version, class_id, horse_id, status, enrolled_at, left_at)
       VALUES ($1, 1, $2, $3, $4, $5, $6)`,
      [
        id,
        classId,
        horseId,
        status,
        enrolledAt,
        status === 'ACTIVE' ? null : '2026-09-20T00:00:00Z',
      ],
    );
    return id;
  };

  const plan = async (classId: string, createdBy: string): Promise<string> => {
    const id = randomUUID();
    await dataSource.query(
      `INSERT INTO training_plans (id, version, class_id, created_by, name, phase_name, goal, start_date, end_date)
       VALUES ($1, 1, $2, $3, 'Giáo án', 'Nền tảng', 'Mục tiêu', '2026-09-01', '2026-12-31')`,
      [id, classId, createdBy],
    );
    return id;
  };

  const session = async (planId: string, startAt: string): Promise<string> => {
    const id = randomUUID();
    const end = new Date(new Date(startAt).getTime() + 3_600_000);
    await dataSource.query(
      `INSERT INTO training_sessions (id, version, plan_id, name, scheduled_start_at, scheduled_end_at)
       VALUES ($1, 1, $2, $3, $4, $5)`,
      [id, planId, `Buổi ${startAt}`, startAt, end],
    );
    return id;
  };

  const participant = async (
    sessionId: string,
    horseId: string,
    enrollmentId: string,
    options: { status?: string; groomId?: string | null } = {},
  ): Promise<string> => {
    const id = randomUUID();
    await dataSource.query(
      `INSERT INTO session_participants (id, version, session_id, horse_id, horse_enrollment_id, assigned_groom_id, status)
       VALUES ($1, 1, $2, $3, $4, $5, $6)`,
      [
        id,
        sessionId,
        horseId,
        enrollmentId,
        options.groomId ?? null,
        options.status ?? 'PLANNED',
      ],
    );
    return id;
  };

  describe('HorseProfilesService reads', () => {
    it('ownerOf returns the owner, also when the account is soft-deleted', async () => {
      const owner = await seed.user(UserRole.HORSE_OWNER);
      await setFullName(owner, 'Chủ A');
      expect(await profiles['ownerOf'](owner)).toEqual({
        id: owner,
        fullName: 'Chủ A',
      });
      await softDeleteUser(owner);
      expect(await profiles['ownerOf'](owner)).toEqual({
        id: owner,
        fullName: 'Chủ A',
      });
      expect(await profiles['ownerOf'](null)).toBeNull();
      expect(await profiles['ownerOf'](randomUUID())).toBeNull();
    });

    it('currentGroom returns the open assignment groom, also when the account is soft-deleted', async () => {
      const horse = await seed.horse('Gió');
      const oldGroom = await seed.user(UserRole.GROOM);
      const groom = await seed.user(UserRole.GROOM);
      await setFullName(groom, 'Groom B');
      await groomAssignment(horse, oldGroom, new Date('2026-09-10T00:00:00Z'));
      expect(await profiles['currentGroom'](horse)).toBeNull();
      await groomAssignment(horse, groom, null);
      expect(await profiles['currentGroom'](horse)).toEqual({
        id: groom,
        fullName: 'Groom B',
      });
      await softDeleteUser(groom);
      expect(await profiles['currentGroom'](horse)).toEqual({
        id: groom,
        fullName: 'Groom B',
      });
    });
  });

  describe('HorseDeletionsService.barnName', () => {
    it('returns the barn name, also for a soft-deleted barn', async () => {
      const barn = await seed.barn('Khu A');
      expect(await deletions['barnName'](dataSource.manager, barn)).toBe(
        'Khu A',
      );
      await softDeleteBarn(barn);
      expect(await deletions['barnName'](dataSource.manager, barn)).toBe(
        'Khu A',
      );
      expect(
        await deletions['barnName'](dataSource.manager, randomUUID()),
      ).toBeNull();
    });
  });

  describe('HorsePlacementsService.findBarnWithHeadTrainer', () => {
    it('returns the barn with its head trainer, keeps a soft-deleted trainer name and skips a soft-deleted barn', async () => {
      const trainer = await seed.user(UserRole.HEAD_TRAINER);
      await setFullName(trainer, 'HT Nam');
      const barn = await seed.barn('Khu A');
      const empty = await seed.barn('Khu B');
      await dataSource.query(
        'UPDATE barns SET head_trainer_id = $2 WHERE id = $1',
        [barn, trainer],
      );

      expect(await placements['findBarnWithHeadTrainer'](barn)).toEqual({
        id: barn,
        name: 'Khu A',
        headTrainerId: trainer,
        headTrainerName: 'HT Nam',
      });
      expect(await placements['findBarnWithHeadTrainer'](empty)).toEqual({
        id: empty,
        name: 'Khu B',
        headTrainerId: null,
        headTrainerName: null,
      });
      await softDeleteUser(trainer);
      expect(
        (await placements['findBarnWithHeadTrainer'](barn))?.headTrainerName,
      ).toBe('HT Nam');
      await softDeleteBarn(barn);
      expect(await placements['findBarnWithHeadTrainer'](barn)).toBeNull();
    });
  });

  describe('HorseAccessService reads', () => {
    it('activeTrainingLockHorseIds returns horses with an ACTIVE lock only', async () => {
      const locked = await seed.horse('Locked');
      const released = await seed.horse('Released');
      const free = await seed.horse('Free');
      await trainingLock(locked, 'ACTIVE');
      await trainingLock(locked, 'RELEASED');
      await trainingLock(released, 'RELEASED');

      const ids = await access.activeTrainingLockHorseIds([
        locked,
        released,
        free,
      ]);

      expect([...ids]).toEqual([locked]);
      expect(await access.activeTrainingLockHorseIds([])).toEqual(new Set());
      expect(await access.hasActiveTrainingLock(locked)).toBe(true);
      expect(await access.hasActiveTrainingLock(free)).toBe(false);
    });

    it('isHorseInTrainerBarn needs a live horse in a live barn led by the trainer', async () => {
      const trainer = await seed.user(UserRole.HEAD_TRAINER);
      const other = await seed.user(UserRole.HEAD_TRAINER);
      const barn = await seed.barn('Khu A');
      await dataSource.query(
        'UPDATE barns SET head_trainer_id = $2 WHERE id = $1',
        [barn, trainer],
      );
      const inBarn = await seed.horse('In', { barnId: barn });
      const deleted = await seed.horse('Deleted', {
        barnId: barn,
        deleted: true,
      });
      const noBarn = await seed.horse('NoBarn');
      const m = dataSource.manager;

      expect(await access.isHorseInTrainerBarn(m, inBarn, trainer)).toBe(true);
      expect(await access.isHorseInTrainerBarn(m, inBarn, other)).toBe(false);
      expect(await access.isHorseInTrainerBarn(m, deleted, trainer)).toBe(
        false,
      );
      expect(await access.isHorseInTrainerBarn(m, noBarn, trainer)).toBe(false);
      await softDeleteBarn(barn);
      expect(await access.isHorseInTrainerBarn(m, inBarn, trainer)).toBe(false);
    });
  });

  describe('Horse training tab reads', () => {
    it('listClasses puts active enrollments first, newest first, and keeps a soft-deleted head trainer name', async () => {
      const horse = await seed.horse('Gió');
      const trainer = await seed.user(UserRole.HEAD_TRAINER);
      await setFullName(trainer, 'HT Nam');
      const classA = await trainingClass('A', trainer);
      const classB = await trainingClass('B', null);
      const classC = await trainingClass('C', trainer);
      const left = await enrollment(
        classA,
        horse,
        'LEFT',
        '2026-09-15T00:00:00Z',
      );
      const active = await enrollment(
        classB,
        horse,
        'ACTIVE',
        '2026-09-01T00:00:00Z',
      );
      const older = await enrollment(
        classC,
        horse,
        'LEFT',
        '2026-08-01T00:00:00Z',
      );
      await softDeleteUser(trainer);

      const rows = await training.listClasses(horse);

      expect(rows.map((row) => row.enrollmentId)).toEqual([
        active,
        left,
        older,
      ]);
      expect(rows[0]).toMatchObject({
        classId: classB,
        code: 'B',
        name: 'Lớp B',
        classStatus: 'ACTIVE',
        headTrainerName: null,
        enrollmentStatus: 'ACTIVE',
        leftAt: null,
      });
      expect(rows[1].headTrainerName).toBe('HT Nam');
      expect(rows[1].enrolledAt).toEqual(new Date('2026-09-15T00:00:00Z'));
    });

    describe('listSessions', () => {
      let horse: string;
      let classA: string;
      let ids: Record<string, string>;

      beforeEach(async () => {
        horse = await seed.horse('Gió');
        const otherHorse = await seed.horse('Mây');
        const trainer = await seed.user(UserRole.HEAD_TRAINER);
        const groom = await seed.user(UserRole.GROOM);
        await setFullName(groom, 'Groom Lan');
        await softDeleteUser(groom);
        classA = await trainingClass('A', trainer);
        const classB = await trainingClass('B', trainer);
        const enrollA = await enrollment(
          classA,
          horse,
          'ACTIVE',
          '2026-09-01T00:00:00Z',
        );
        const enrollB = await enrollment(
          classB,
          horse,
          'ACTIVE',
          '2026-09-01T00:00:00Z',
        );
        const enrollOther = await enrollment(
          classA,
          otherHorse,
          'ACTIVE',
          '2026-09-01T00:00:00Z',
        );
        const planA = await plan(classA, trainer);
        const planB = await plan(classB, trainer);
        const past = await session(planA, '2026-09-20T01:00:00Z');
        const soon = await session(planA, '2026-10-02T01:00:00Z');
        const later = await session(planB, '2026-10-05T01:00:00Z');
        const atNow = await session(planB, NOW.toISOString());
        ids = {
          past: await participant(past, horse, enrollA, {
            status: 'COMPLETED',
          }),
          soon: await participant(soon, horse, enrollA, { groomId: groom }),
          cancelled: await participant(later, horse, enrollB, {
            status: 'CANCELLED',
          }),
          atNow: await participant(atNow, horse, enrollB, {
            status: 'CANCELLED_BY_LOCK',
          }),
          other: await participant(soon, otherHorse, enrollOther),
        };
      });

      const list = (
        patch: Partial<Parameters<HorseTrainingRepository['listSessions']>[1]>,
      ) =>
        training.listSessions(horse, {
          now: NOW,
          skip: 0,
          limit: 20,
          ...patch,
        });

      it('lists every session of the horse, newest first, when no time filter is set', async () => {
        const { rows, total } = await list({});

        expect(total).toBe(4);
        expect(rows.map((row) => row.participantId)).toEqual([
          ids.cancelled,
          ids.soon,
          ids.atNow,
          ids.past,
        ]);
      });

      it('lists upcoming sessions from now, nearest first, without cancelled ones', async () => {
        const { rows, total } = await list({
          when: HorseTrainingSessionWhen.UPCOMING,
        });

        expect(total).toBe(1);
        expect(rows.map((row) => row.participantId)).toEqual([ids.soon]);
        expect(rows[0]).toMatchObject({
          className: 'Lớp A',
          planName: 'Giáo án',
          phaseName: 'Nền tảng',
          sessionType: 'REGULAR',
          sessionStatus: 'DRAFT',
          participantStatus: 'PLANNED',
          groomName: 'Groom Lan',
          classId: classA,
        });
      });

      it('lists history sessions before now, newest first, and filters by class', async () => {
        const history = await list({ when: HorseTrainingSessionWhen.HISTORY });
        expect(history.rows.map((row) => row.participantId)).toEqual([
          ids.past,
        ]);

        const byClass = await list({ classId: classA });
        expect(byClass.total).toBe(2);
        expect(byClass.rows.map((row) => row.participantId)).toEqual([
          ids.soon,
          ids.past,
        ]);
      });

      it('pages with skip and limit while total counts every match', async () => {
        const page = await list({ skip: 1, limit: 2 });

        expect(page.total).toBe(4);
        expect(page.rows.map((row) => row.participantId)).toEqual([
          ids.soon,
          ids.atNow,
        ]);
      });

      it('lists trial results by participant then attempt, with elapsed time as text', async () => {
        const recorder = await seed.user(UserRole.HEAD_TRAINER);
        const [{ session_id: sessionId }] = await dataSource.query<
          Array<{ session_id: string }>
        >('SELECT session_id FROM session_participants WHERE id = $1', [
          ids.soon,
        ]);
        const timeTrial = randomUUID();
        await dataSource.query(
          `INSERT INTO time_trials (id, version, session_id, distance_m) VALUES ($1, 1, $2, 1200)`,
          [timeTrial, sessionId],
        );
        const trial = (participantId: string, attemptNo: number, ms: string) =>
          dataSource.query(
            `INSERT INTO trial_results (id, version, time_trial_id, session_participant_id, attempt_no, elapsed_ms, recorded_by, recorded_at)
             VALUES ($1, 1, $2, $3, $4, $5, $6, '2026-10-02T02:00:00Z')`,
            [randomUUID(), timeTrial, participantId, attemptNo, ms, recorder],
          );
        await trial(ids.soon, 2, '61000');
        await trial(ids.other, 1, '59000');
        await trial(ids.soon, 1, '9007199254740993');

        const rows = await trainingService['listTrialResults']([ids.soon]);

        expect(rows).toEqual([
          {
            participantId: ids.soon,
            attemptNo: 1,
            elapsedMs: '9007199254740993',
            notes: null,
            recordedAt: new Date('2026-10-02T02:00:00Z'),
          },
          {
            participantId: ids.soon,
            attemptNo: 2,
            elapsedMs: '61000',
            notes: null,
            recordedAt: new Date('2026-10-02T02:00:00Z'),
          },
        ]);
        expect(await trainingService['listTrialResults']([])).toEqual([]);
      });

      it('lists evaluations with the evaluator name, also for a soft-deleted evaluator', async () => {
        const evaluator = await seed.user(UserRole.HEAD_TRAINER);
        await setFullName(evaluator, 'HT Nam');
        await dataSource.query(
          `INSERT INTO performance_evaluations (id, version, evaluator_id, score, comment, session_participant_id, created_at)
           VALUES ($1, 1, $2, 8, 'Ổn', $3, '2026-10-02T03:00:00Z')`,
          [randomUUID(), evaluator, ids.past],
        );
        await softDeleteUser(evaluator);

        const rows = await trainingService['listEvaluations']([
          ids.past,
          ids.soon,
        ]);

        expect(rows).toEqual([
          {
            participantId: ids.past,
            score: 8,
            comment: 'Ổn',
            evaluatorName: 'HT Nam',
            createdAt: new Date('2026-10-02T03:00:00Z'),
          },
        ]);
        expect(await trainingService['listEvaluations']([])).toEqual([]);
      });
    });
  });
});

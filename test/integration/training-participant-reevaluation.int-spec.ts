import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { UserRole } from '../../src/common/enums/role.enum';
import { HorseHealthStatus } from '../../src/modules/horses/enums/horse-status.enum';
import { TrainingIntensity } from '../../src/modules/training/enums/training-intensity.enum';
import { TrainingOperationsFacade } from '../../src/modules/training/shared/training-operations.facade';
import { ParticipantEligibilityListener } from '../../src/modules/training/training-sessions/participant-eligibility.listener';
import { SessionAutoCloseService } from '../../src/modules/training/training-sessions/session-auto-close.service';
import { fixtures } from './fixtures';
import {
  startTestPostgres,
  stopTestPostgres,
  truncateAllTables,
  type TestPostgres,
} from './postgres';

const HOUR = 3_600_000;

describe('Re-evaluating upcoming participants and closing started sessions (Postgres)', () => {
  let db: TestPostgres;
  let dataSource: DataSource;
  let seed: ReturnType<typeof fixtures>;
  let facade: TrainingOperationsFacade;
  let listener: ParticipantEligibilityListener;
  let job: SessionAutoCloseService;
  let classId: string;
  let vetId: string;

  beforeAll(async () => {
    db = await startTestPostgres();
    dataSource = db.dataSource;
    seed = fixtures(dataSource);
    facade = new TrainingOperationsFacade();
    listener = new ParticipantEligibilityListener(dataSource, facade);
    job = new SessionAutoCloseService(dataSource, facade);
  });

  afterAll(() => stopTestPostgres(db));

  beforeEach(async () => {
    await truncateAllTables(dataSource);
    const trainer = await seed.user(UserRole.HEAD_TRAINER);
    vetId = await seed.user(UserRole.VETERINARIAN);
    ({ classId } = await seed.trainingClass(trainer, {
      startDate: '2020-01-01',
      endDate: '2099-12-31',
    }));
  });

  const horse = async (health?: HorseHealthStatus) => {
    const horseId = await seed.horse(`Ngựa ${randomUUID().slice(0, 4)}`, {
      health,
    });
    const enrollmentId = randomUUID();
    await dataSource.query(
      `INSERT INTO horse_enrollments (id, version, class_id, horse_id, status, enrolled_at)
       VALUES ($1, 1, $2, $3, 'ACTIVE', '2020-01-01T00:00:00Z')`,
      [enrollmentId, classId, horseId],
    );
    return { horseId, enrollmentId };
  };

  const session = async (
    startOffsetHours: number,
    intensity: TrainingIntensity = TrainingIntensity.MODERATE,
  ) => {
    const id = randomUUID();
    const start = new Date(Date.now() + startOffsetHours * HOUR);
    await dataSource.query(
      `INSERT INTO training_sessions (id, version, class_id, name, scheduled_start_at, scheduled_end_at, status, intensity, planned_distance_m)
       VALUES ($1, 1, $2, 'Buổi', $3, $4, 'SCHEDULED', $5, 3000)`,
      [id, classId, start, new Date(start.getTime() + HOUR), intensity],
    );
    return id;
  };

  const participant = async (
    sessionId: string,
    owner: { horseId: string; enrollmentId: string },
    status: string,
    ineligibilityReason: string | null = null,
  ) => {
    const id = randomUUID();
    await dataSource.query(
      `INSERT INTO session_participants (id, version, session_id, horse_id, horse_enrollment_id, status, ineligibility_reason)
       VALUES ($1, 1, $2, $3, $4, $5, $6)`,
      [
        id,
        sessionId,
        owner.horseId,
        owner.enrollmentId,
        status,
        ineligibilityReason,
      ],
    );
    return id;
  };

  const setLock = async (horseId: string) => {
    const id = randomUUID();
    await dataSource.query(
      `INSERT INTO training_locks (id, version, horse_id, locked_by, reason, lock_start, status)
       VALUES ($1, 1, $2, $3, 'Nghỉ', now(), 'ACTIVE')`,
      [id, horseId, vetId],
    );
    return id;
  };

  const releaseLock = (lockId: string) =>
    dataSource.query(
      `UPDATE training_locks
          SET status = 'RELEASED', released_by = $2, released_at = now(), release_conclusion = 'Khỏi'
        WHERE id = $1`,
      [lockId, vetId],
    );

  const participantRow = async (id: string) => {
    const [row] = await dataSource.query<
      Array<{ status: string; ineligibility_reason: string | null }>
    >(
      'SELECT status, ineligibility_reason FROM session_participants WHERE id = $1',
      [id],
    );
    return row;
  };

  const sessionRow = async (id: string) => {
    const [row] = await dataSource.query<
      Array<{ status: string; cancel_reason: string | null }>
    >('SELECT status, cancel_reason FROM training_sessions WHERE id = $1', [
      id,
    ]);
    return row;
  };

  describe('listener on lock and health events', () => {
    it('cancels upcoming participants by lock when a lock is set, and keeps the upcoming session SCHEDULED', async () => {
      const winx = await horse();
      const upcoming = await session(48);
      const planned = await participant(upcoming, winx, 'PLANNED');
      const lockId = await setLock(winx.horseId);

      await listener.handle({
        eventId: randomUUID(),
        horseId: winx.horseId,
        lockId,
        reason: 'Nghỉ',
        expectedEnd: null,
      });

      expect(await participantRow(planned)).toEqual({
        status: 'CANCELLED_BY_LOCK',
        ineligibility_reason: 'ACTIVE_TRAINING_LOCK',
      });
      expect((await sessionRow(upcoming)).status).toBe('SCHEDULED');
    });

    it('brings participants cancelled by lock back to PLANNED when the lock is released', async () => {
      const winx = await horse();
      const upcoming = await session(48);
      const cancelled = await participant(
        upcoming,
        winx,
        'CANCELLED_BY_LOCK',
        'ACTIVE_TRAINING_LOCK',
      );
      const lockId = await setLock(winx.horseId);
      await releaseLock(lockId);

      await listener.handle({
        eventId: randomUUID(),
        horseId: winx.horseId,
        lockId,
        conclusion: 'Khỏi',
      });

      expect(await participantRow(cancelled)).toEqual({
        status: 'PLANNED',
        ineligibility_reason: null,
      });
    });

    it('marks participants INELIGIBLE when the lock is released but the horse is still injured', async () => {
      const winx = await horse(HorseHealthStatus.INJURED);
      const upcoming = await session(48);
      const cancelled = await participant(
        upcoming,
        winx,
        'CANCELLED_BY_LOCK',
        'HEALTH_INJURED,ACTIVE_TRAINING_LOCK',
      );
      const lockId = await setLock(winx.horseId);
      await releaseLock(lockId);

      await listener.handle({
        eventId: randomUUID(),
        horseId: winx.horseId,
        lockId,
        conclusion: 'Khỏi',
      });

      expect(await participantRow(cancelled)).toEqual({
        status: 'INELIGIBLE',
        ineligibility_reason: 'HEALTH_INJURED',
      });
    });

    it('applies session intensity when health changes to under observation', async () => {
      const winx = await horse(HorseHealthStatus.UNDER_OBSERVATION);
      const heavy = await participant(
        await session(48, TrainingIntensity.HEAVY),
        winx,
        'PLANNED',
      );
      const light = await participant(
        await session(72, TrainingIntensity.LIGHT),
        winx,
        'INELIGIBLE',
        'HEALTH_INJURED',
      );

      await listener.handle({
        eventId: randomUUID(),
        horseId: winx.horseId,
        from: HorseHealthStatus.INJURED,
        to: HorseHealthStatus.UNDER_OBSERVATION,
      });

      expect(await participantRow(heavy)).toEqual({
        status: 'INELIGIBLE',
        ineligibility_reason: 'HEALTH_UNDER_OBSERVATION',
      });
      expect(await participantRow(light)).toEqual({
        status: 'PLANNED',
        ineligibility_reason: null,
      });
    });

    it('leaves PRESENT participants and sessions that already started untouched', async () => {
      const winx = await horse();
      const present = await participant(await session(48), winx, 'PRESENT');
      const started = await participant(await session(-1), winx, 'PLANNED');
      await setLock(winx.horseId);

      await listener.handle({
        eventId: randomUUID(),
        horseId: winx.horseId,
        lockId: randomUUID(),
        reason: 'Nghỉ',
        expectedEnd: null,
      });

      expect((await participantRow(present)).status).toBe('PRESENT');
      expect((await participantRow(started)).status).toBe('PLANNED');
    });

    it('gives the same result when the same event is delivered twice', async () => {
      const winx = await horse();
      const upcoming = await session(48);
      const planned = await participant(upcoming, winx, 'PLANNED');
      const lockId = await setLock(winx.horseId);
      const event = {
        eventId: randomUUID(),
        horseId: winx.horseId,
        lockId,
        reason: 'Nghỉ',
        expectedEnd: null,
      };

      await listener.handle(event);
      const first = await participantRow(planned);
      await listener.handle(event);

      expect(await participantRow(planned)).toEqual(first);
      expect(first.status).toBe('CANCELLED_BY_LOCK');
      expect((await sessionRow(upcoming)).status).toBe('SCHEDULED');
    });
  });

  describe('refreshSessionStatus', () => {
    it('keeps an upcoming SCHEDULED session open when no participant is left', async () => {
      const winx = await horse();
      const upcoming = await session(48);
      await participant(upcoming, winx, 'CANCELLED');

      await dataSource.transaction((manager) =>
        facade.refreshSessionStatus(manager, upcoming),
      );

      expect((await sessionRow(upcoming)).status).toBe('SCHEDULED');
    });

    it('still cancels a started session right away when no participant is left', async () => {
      const winx = await horse();
      const started = await session(-1);
      await participant(started, winx, 'CANCELLED');

      await dataSource.transaction((manager) =>
        facade.refreshSessionStatus(manager, started),
      );

      expect(await sessionRow(started)).toEqual({
        status: 'CANCELLED',
        cancel_reason: 'Không còn ngựa tham gia',
      });
    });
  });

  describe('auto-close job', () => {
    it('closes started sessions without open participants and leaves the others', async () => {
      const winx = await horse();
      const blue = await horse();
      const noOneLeft = await session(-2);
      await participant(noOneLeft, winx, 'CANCELLED_BY_LOCK');
      const happened = await session(-3);
      await participant(happened, winx, 'COMPLETED');
      await participant(happened, blue, 'CANCELLED');
      const stillOpen = await session(-1);
      await participant(stillOpen, winx, 'PLANNED');
      const upcoming = await session(48);
      await participant(upcoming, winx, 'INELIGIBLE');

      expect(await job.closeStartedSessions()).toBe(2);

      expect(await sessionRow(noOneLeft)).toEqual({
        status: 'CANCELLED',
        cancel_reason: 'Không còn ngựa tham gia',
      });
      expect((await sessionRow(happened)).status).toBe('COMPLETED');
      expect((await sessionRow(stillOpen)).status).toBe('SCHEDULED');
      expect((await sessionRow(upcoming)).status).toBe('SCHEDULED');
      expect(await job.closeStartedSessions()).toBe(0);
    });
  });
});

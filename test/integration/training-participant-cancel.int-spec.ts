import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { UserRole } from '../../src/common/enums/role.enum';
import { TrainingOperationsFacade } from '../../src/modules/training/shared/training-operations.facade';
import { fixtures } from './fixtures';
import {
  startTestDatabase,
  stopTestDatabase,
  truncateAll,
  type TestDatabase,
} from './postgres';

describe('TrainingOperationsFacade.cancelParticipantsFromEnrollments (Postgres)', () => {
  let db: TestDatabase;
  let dataSource: DataSource;
  let seed: ReturnType<typeof fixtures>;
  const facade = new TrainingOperationsFacade();

  beforeAll(async () => {
    db = await startTestDatabase();
    dataSource = db.dataSource;
    seed = fixtures(dataSource);
  });

  afterAll(() => stopTestDatabase(db));

  beforeEach(() => truncateAll(dataSource));

  const seedParticipant = async () => {
    const trainer = await seed.user(UserRole.HEAD_TRAINER);
    const horse = await seed.horse('Gió');
    const classId = randomUUID();
    await dataSource.query(
      `INSERT INTO training_classes (id, version, name, code, head_trainer_id, start_date, end_date, status)
       VALUES ($1, 1, 'Lớp A', 'A', $2, '2026-09-01', '2026-12-31', 'ACTIVE')`,
      [classId, trainer],
    );
    const enrollmentId = randomUUID();
    await dataSource.query(
      `INSERT INTO horse_enrollments (id, version, class_id, horse_id, status, enrolled_at)
       VALUES ($1, 1, $2, $3, 'ACTIVE', '2026-09-05T00:00:00Z')`,
      [enrollmentId, classId, horse],
    );
    const planId = randomUUID();
    await dataSource.query(
      `INSERT INTO training_plans (id, version, class_id, created_by, name, phase_name, goal, start_date, end_date)
       VALUES ($1, 1, $2, $3, 'Giáo án', 'Nền tảng', 'Mục tiêu', '2026-09-01', '2026-12-31')`,
      [planId, classId, trainer],
    );
    const sessionId = randomUUID();
    await dataSource.query(
      `INSERT INTO training_sessions (id, version, plan_id, name, scheduled_start_at, scheduled_end_at)
       VALUES ($1, 1, $2, 'Buổi 1', '2026-10-10T01:00:00Z', '2026-10-10T02:00:00Z')`,
      [sessionId, planId],
    );
    const participantId = randomUUID();
    await dataSource.query(
      `INSERT INTO session_participants (id, version, session_id, horse_id, horse_enrollment_id, status)
       VALUES ($1, 1, $2, $3, $4, 'PLANNED')`,
      [participantId, sessionId, horse, enrollmentId],
    );
    return { enrollmentId, participantId };
  };

  const statusOf = async (participantId: string): Promise<string> => {
    const [row] = await dataSource.query<Array<{ status: string }>>(
      'SELECT status FROM session_participants WHERE id = $1',
      [participantId],
    );
    return row.status;
  };

  it('cancels an open participant of a session after the given time', async () => {
    const { enrollmentId, participantId } = await seedParticipant();

    const cancelled = await dataSource.transaction((manager) =>
      facade.cancelParticipantsFromEnrollments(
        manager,
        [enrollmentId],
        new Date('2026-10-01T00:00:00Z'),
        'Rời lớp',
      ),
    );

    expect(cancelled).toBe(1);
    expect(await statusOf(participantId)).toBe('CANCELLED');
  });

  it('keeps a participant that another transaction moves to ONGOING at the same time', async () => {
    const { enrollmentId, participantId } = await seedParticipant();
    const starter = dataSource.createQueryRunner();
    await starter.connect();
    await starter.startTransaction();
    await starter.query(
      "UPDATE session_participants SET status = 'ONGOING' WHERE id = $1",
      [participantId],
    );

    const cancelling = dataSource.transaction((manager) =>
      facade.cancelParticipantsFromEnrollments(
        manager,
        [enrollmentId],
        new Date('2026-10-01T00:00:00Z'),
        'Rời lớp',
      ),
    );
    await new Promise((resolve) => setTimeout(resolve, 300));
    await starter.commitTransaction();
    await starter.release();

    await expect(cancelling).resolves.toBe(0);
    expect(await statusOf(participantId)).toBe('ONGOING');
  });
});

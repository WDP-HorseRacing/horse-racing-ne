import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { UserRole } from '../../src/common/enums/role.enum';
import { MoveTimeTrialToSession1789828800000 } from '../../src/migrations/1789828800000-MoveTimeTrialToSession';
import { fixtures } from './fixtures';
import {
  startTestPostgres,
  stopTestPostgres,
  truncateAllTables,
  type TestPostgres,
} from './postgres';

describe('MoveTimeTrialToSession migration (Postgres)', () => {
  let db: TestPostgres;
  let dataSource: DataSource;
  let seed: ReturnType<typeof fixtures>;
  const migration = new MoveTimeTrialToSession1789828800000();

  beforeAll(async () => {
    db = await startTestPostgres();
    dataSource = db.dataSource;
    seed = fixtures(dataSource);
  });

  afterAll(() => stopTestPostgres(db));

  beforeEach(() => truncateAllTables(dataSource));

  const run = async (step: 'up' | 'down') => {
    const runner = dataSource.createQueryRunner();
    try {
      await migration[step](runner);
    } finally {
      await runner.release();
    }
  };

  it('matches the entities once all migrations ran', async () => {
    const sql = await dataSource.driver.createSchemaBuilder().log();

    expect(
      sql.upQueries
        .map((query) => query.query)
        .filter((query) =>
          ['target_time', 'trial_results', 'time_trials'].some((name) =>
            query.includes(name),
          ),
        ),
    ).toEqual([]);
  });

  it('moves the target time and notes into the session and keeps trial results, then back', async () => {
    const trainerId = await seed.user(UserRole.HEAD_TRAINER);
    const { classId } = await seed.trainingClass(trainerId);
    const horseId = await seed.horse('Winx');
    await run('down');
    const session = async (
      name: string,
      type: string,
      notes: string | null,
    ) => {
      const id = randomUUID();
      await dataSource.query(
        `INSERT INTO training_sessions (id, version, class_id, name, session_type, scheduled_start_at, scheduled_end_at, status, intensity, planned_distance_m, notes)
         VALUES ($1, 1, $2, $3, $4, '2030-01-10T01:00:00Z', '2030-01-10T02:00:00Z', 'COMPLETED', 'HEAVY', 1200, $5)`,
        [id, classId, name, type, notes],
      );
      return id;
    };
    const both = await session('both', 'TIME_TRIAL', 'Sân ướt');
    const trialOnly = await session('trialOnly', 'TIME_TRIAL', null);
    await session('plain', 'REGULAR', 'Buổi thường');
    for (const [sessionId, target, notes] of [
      [both, 62000, 'Bấm tay'],
      [trialOnly, null, 'Gió mạnh'],
    ] as const) {
      await dataSource.query(
        `INSERT INTO time_trials (version, session_id, distance_m, target_time_ms, notes)
         VALUES (1, $1, 1200, $2, $3)`,
        [sessionId, target, notes],
      );
    }
    const enrollmentId = randomUUID();
    await dataSource.query(
      `INSERT INTO horse_enrollments (id, version, class_id, horse_id, status, enrolled_at)
       VALUES ($1, 1, $2, $3, 'ACTIVE', '2030-01-01T00:00:00Z')`,
      [enrollmentId, classId, horseId],
    );
    const participantId = randomUUID();
    await dataSource.query(
      `INSERT INTO session_participants (id, version, session_id, horse_id, horse_enrollment_id, status)
       VALUES ($1, 1, $2, $3, $4, 'COMPLETED')`,
      [participantId, both, horseId, enrollmentId],
    );
    await dataSource.query(
      `INSERT INTO trial_results (version, time_trial_id, session_participant_id, attempt_no, elapsed_ms, recorded_by, recorded_at)
       SELECT 1, id, $2, 1, 61000, $3, now() FROM time_trials WHERE session_id = $1`,
      [both, participantId, trainerId],
    );

    await run('up');

    await expect(
      dataSource.query(
        `SELECT name, target_time_ms, notes FROM training_sessions ORDER BY name`,
      ),
    ).resolves.toEqual([
      { name: 'both', target_time_ms: 62000, notes: 'Sân ướt\nBấm tay' },
      { name: 'plain', target_time_ms: null, notes: 'Buổi thường' },
      { name: 'trialOnly', target_time_ms: null, notes: 'Gió mạnh' },
    ]);
    await expect(
      dataSource.query(
        `SELECT session_participant_id, attempt_no FROM trial_results`,
      ),
    ).resolves.toEqual([
      { session_participant_id: participantId, attempt_no: 1 },
    ]);

    await run('down');

    await expect(
      dataSource.query(
        `SELECT s.name, t.distance_m::float AS distance, t.target_time_ms::int AS target,
                (SELECT count(*)::int FROM trial_results r WHERE r.time_trial_id = t.id) AS results
           FROM time_trials t JOIN training_sessions s ON s.id = t.session_id
          ORDER BY s.name`,
      ),
    ).resolves.toEqual([
      { name: 'both', distance: 1200, target: 62000, results: 1 },
      { name: 'trialOnly', distance: 1200, target: null, results: 0 },
    ]);
    await run('up');
  });
});

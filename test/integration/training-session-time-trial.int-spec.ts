import { DataSource } from 'typeorm';
import { UserRole } from '../../src/common/enums/role.enum';
import type { Actor } from '../../src/common/types/actor';
import { HorseAccessService } from '../../src/modules/horses/shared/horse-access.service';
import { TimeTrialEntity } from '../../src/modules/training/entities/time-trial.entity';
import { TrainingSubjectEntity } from '../../src/modules/training/entities/training-subject.entity';
import { TrainingIntensity } from '../../src/modules/training/enums/training-intensity.enum';
import { TrainingSessionType } from '../../src/modules/training/enums/training-session-type.enum';
import { TrainingAccessService } from '../../src/modules/training/shared/training-access.service';
import { TimeTrialsService } from '../../src/modules/training/time-trials/time-trials.service';
import { TrainingSubjectsService } from '../../src/modules/training/training-subjects/training-subjects.service';
import { fixtures } from './fixtures';
import {
  startTestPostgres,
  stopTestPostgres,
  truncateAllTables,
  type TestPostgres,
} from './postgres';

describe('Time trial config of a training session (Postgres)', () => {
  let db: TestPostgres;
  let dataSource: DataSource;
  let seed: ReturnType<typeof fixtures>;
  let timeTrials: TimeTrialsService;
  let subjects: TrainingSubjectsService;
  let trainer: Actor;
  let trial: string;
  let classId: string;

  beforeAll(async () => {
    db = await startTestPostgres();
    dataSource = db.dataSource;
    seed = fixtures(dataSource);
    const access = new TrainingAccessService(
      dataSource,
      new HorseAccessService(dataSource),
    );
    timeTrials = new TimeTrialsService(
      dataSource.getRepository(TimeTrialEntity),
      access,
      dataSource,
    );
    subjects = new TrainingSubjectsService(
      dataSource.getRepository(TrainingSubjectEntity),
      access,
      dataSource,
    );
  });

  afterAll(() => stopTestPostgres(db));

  async function actorOf(role: UserRole, id?: string): Promise<Actor> {
    const userId = id ?? (await seed.user(role));
    const [row] = await dataSource.query<Array<{ keycloak_id: string }>>(
      'SELECT keycloak_id FROM users WHERE id = $1',
      [userId],
    );
    return { sub: row.keycloak_id, roles: [role] };
  }

  beforeEach(async () => {
    await truncateAllTables(dataSource);
    const trainerId = await seed.user(UserRole.HEAD_TRAINER);
    trainer = await actorOf(UserRole.HEAD_TRAINER, trainerId);
    trial = (
      await subjects.create(await actorOf(UserRole.CLUB_MANAGER), {
        name: 'Chạy thử 1200',
        sessionType: TrainingSessionType.TIME_TRIAL,
        intensity: TrainingIntensity.HEAVY,
        plannedDistanceM: 1200,
        targetTimeMs: 75000,
      })
    ).id;
    ({ classId } = await seed.trainingClass(trainerId, {
      startDate: '2030-01-01',
      endDate: '2030-12-31',
      status: 'DRAFT',
    }));
  });

  describe('a null target time means no target', () => {
    it('configures a time trial on a session without a target', async () => {
      const [{ id: sessionId }] = await dataSource.query<Array<{ id: string }>>(
        `INSERT INTO training_sessions (version, class_id, subject_id, name, session_type, scheduled_start_at, scheduled_end_at, status, intensity, planned_distance_m)
         VALUES (1, $1, $2, 'Chạy thử', 'TIME_TRIAL', '2030-01-10T01:00:00Z', '2030-01-10T02:00:00Z', 'DRAFT', 'HEAVY', 1200)
         RETURNING id`,
        [classId, trial],
      );

      await expect(
        timeTrials.create(trainer, sessionId, {
          distanceM: 1200,
          targetTimeMs: null,
        }),
      ).resolves.toMatchObject({ sessionId, targetTimeMs: null });
    });
  });
});

import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { UserRole } from '../../src/common/enums/role.enum';
import type { Actor } from '../../src/common/types/actor';
import { HorseAccessService } from '../../src/modules/horses/shared/horse-access.service';
import { TrainingClassEntity } from '../../src/modules/training/entities/training-class.entity';
import { TrainingPlanEntity } from '../../src/modules/training/entities/training-plan.entity';
import { TrainingSubjectEntity } from '../../src/modules/training/entities/training-subject.entity';
import { TrainingIntensity } from '../../src/modules/training/enums/training-intensity.enum';
import { TrainingSessionType } from '../../src/modules/training/enums/training-session-type.enum';
import { TrainingAccessService } from '../../src/modules/training/shared/training-access.service';
import { TrainingClassesService } from '../../src/modules/training/training-classes/services/training-classes.service';
import { TrainingPlansService } from '../../src/modules/training/training-plans/training-plans.service';
import { TrainingSubjectsService } from '../../src/modules/training/training-subjects/training-subjects.service';
import { TimeTrialEntity } from '../../src/modules/training/entities/time-trial.entity';
import { TimeTrialsService } from '../../src/modules/training/time-trials/time-trials.service';
import { fixtures } from './fixtures';
import {
  startTestPostgres,
  stopTestPostgres,
  truncateAllTables,
  type TestPostgres,
} from './postgres';

describe('Training plans and classes built from them (Postgres)', () => {
  let db: TestPostgres;
  let dataSource: DataSource;
  let seed: ReturnType<typeof fixtures>;
  let plans: TrainingPlansService;
  let classes: TrainingClassesService;
  let subjects: TrainingSubjectsService;
  let timeTrials: TimeTrialsService;
  let manager: Actor;
  let trainer: Actor;
  let trainerId: string;
  let endurance: string;
  let sprint: string;

  beforeAll(async () => {
    db = await startTestPostgres();
    dataSource = db.dataSource;
    seed = fixtures(dataSource);
    const access = new TrainingAccessService(
      dataSource,
      new HorseAccessService(dataSource),
    );
    plans = new TrainingPlansService(
      dataSource.getRepository(TrainingPlanEntity),
      access,
      dataSource,
    );
    classes = new TrainingClassesService(
      dataSource.getRepository(TrainingClassEntity),
      access,
      dataSource,
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
    manager = await actorOf(UserRole.CLUB_MANAGER);
    trainerId = await seed.user(UserRole.HEAD_TRAINER);
    trainer = await actorOf(UserRole.HEAD_TRAINER, trainerId);
    const subject = (name: string) =>
      subjects.create(manager, {
        name,
        sessionType: TrainingSessionType.REGULAR,
        intensity: TrainingIntensity.MODERATE,
        plannedDistanceM: 3000,
      });
    endurance = (await subject('Sức bền')).id;
    sprint = (await subject('Nước rút')).id;
  });

  const oneSession = (overrides: Record<string, unknown> = {}) => ({
    subjectId: endurance,
    name: 'Sức bền',
    intensity: TrainingIntensity.MODERATE,
    plannedDistanceM: 3000,
    scheduledStartAt: '2026-10-04T23:00:00.000Z',
    scheduledEndAt: '2026-10-05T00:00:00.000Z',
    ...overrides,
  });

  const twoPhases = () => ({
    name: 'Chuẩn bị đua 1200m',
    subjects: [
      { subjectId: endurance, weeks: 4 },
      { subjectId: sprint, weeks: 2 },
    ],
  });

  it('creates a plan with subjects in order and their start weeks', async () => {
    const plan = await plans.create(trainer, twoPhases());

    expect(plan).toMatchObject({
      headTrainerId: trainerId,
      totalWeeks: 6,
      subjects: [
        { position: 1, startWeek: 1, weeks: 4, subject: { name: 'Sức bền' } },
        { position: 2, startWeek: 5, weeks: 2, subject: { name: 'Nước rút' } },
      ],
    });
  });

  it('replaces the subject list on update', async () => {
    const plan = await plans.create(trainer, twoPhases());

    const updated = await plans.update(trainer, plan.id, {
      name: 'Chỉ nước rút',
      subjects: [{ subjectId: sprint, weeks: 3 }],
    });

    expect(updated.totalWeeks).toBe(3);
    expect(updated.subjects.map((item) => item.subject.name)).toEqual([
      'Nước rút',
    ]);
  });

  it('rejects an unknown subject with 400', async () => {
    await expect(
      plans.create(trainer, {
        name: 'Sai',
        subjects: [
          { subjectId: '00000000-0000-4000-8000-000000000000', weeks: 1 },
        ],
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('hides a plan from another head trainer but shows it to the club manager', async () => {
    const plan = await plans.create(trainer, twoPhases());
    const other = await actorOf(UserRole.HEAD_TRAINER);

    await expect(plans.get(other, plan.id)).rejects.toThrow(NotFoundException);
    await expect(plans.update(other, plan.id, twoPhases())).rejects.toThrow(
      NotFoundException,
    );
    await expect(plans.get(manager, plan.id)).resolves.toMatchObject({
      id: plan.id,
    });
    expect((await plans.list(other)).length).toBe(0);
    expect((await plans.list(manager)).length).toBe(1);
  });

  it('creates a class whose end date follows the plan weeks', async () => {
    const plan = await plans.create(trainer, twoPhases());

    const created = await classes.create(trainer, {
      code: 'K1',
      name: 'K1',
      planId: plan.id,
      startDate: '2026-10-05',
      sessions: [oneSession()],
    });

    expect(created).toMatchObject({
      planId: plan.id,
      startDate: '2026-10-05',
      endDate: '2026-11-15',
    });
  });

  it('rejects a class built from another head trainer plan', async () => {
    const plan = await plans.create(trainer, twoPhases());
    const otherId = await seed.user(UserRole.HEAD_TRAINER);

    await expect(
      classes.create(manager, {
        code: 'K2',
        name: 'K2',
        planId: plan.id,
        headTrainerId: otherId,
        startDate: '2026-10-05',
        sessions: [oneSession()],
      }),
    ).rejects.toThrow(
      new BadRequestException('Giáo án không thuộc Head Trainer phụ trách lớp'),
    );
  });

  it('refuses to delete a plan used by a class', async () => {
    const plan = await plans.create(trainer, twoPhases());
    await classes.create(trainer, {
      code: 'K1',
      name: 'K1',
      planId: plan.id,
      startDate: '2026-10-05',
      sessions: [oneSession()],
    });

    await expect(plans.remove(trainer, plan.id)).rejects.toThrow(
      ConflictException,
    );
  });

  it('refuses to delete a subject used by a plan', async () => {
    await plans.create(trainer, twoPhases());

    await expect(subjects.remove(manager, endurance)).rejects.toThrow(
      ConflictException,
    );
  });

  it('previews a schedule from the plan without saving anything', async () => {
    const plan = await plans.create(trainer, twoPhases());

    const preview = await classes.previewSchedule(trainer, {
      planId: plan.id,
      startDate: '2026-10-05',
      weekdays: [1, 3, 5],
      startTime: '06:00',
      durationMinutes: 60,
    });

    expect(preview.endDate).toBe('2026-11-15');
    expect(preview.sessions).toHaveLength(18);
    expect(preview.sessions[0]).toMatchObject({
      week: 1,
      subjectId: endurance,
      name: 'Sức bền',
      plannedDistanceM: 3000,
      scheduledStartAt: new Date('2026-10-04T23:00:00.000Z'),
    });
    expect(preview.sessions[12]).toMatchObject({ week: 5, subjectId: sprint });
    const [{ count }] = await dataSource.query<Array<{ count: string }>>(
      'SELECT count(*) FROM training_classes',
    );
    expect(count).toBe('0');
  });

  it('refuses to preview another head trainer plan', async () => {
    const plan = await plans.create(trainer, twoPhases());
    const other = await actorOf(UserRole.HEAD_TRAINER);

    await expect(
      classes.previewSchedule(other, {
        planId: plan.id,
        startDate: '2026-10-05',
        weekdays: [1],
        startTime: '06:00',
        durationMinutes: 60,
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('creates the class with draft sessions and a time trial config for time trial subjects', async () => {
    const trial = await subjects.create(manager, {
      name: 'Chạy thử 1200',
      sessionType: TrainingSessionType.TIME_TRIAL,
      intensity: TrainingIntensity.HEAVY,
      plannedDistanceM: 1200,
      targetTimeMs: 75000,
    });
    const plan = await plans.create(trainer, twoPhases());

    const created = await classes.create(trainer, {
      code: 'K1',
      name: 'K1',
      planId: plan.id,
      startDate: '2026-10-05',
      sessions: [
        oneSession(),
        oneSession({
          subjectId: trial.id,
          name: 'Chạy thử cuối giai đoạn',
          plannedDistanceM: 1000,
          targetTimeMs: 62000,
          scheduledStartAt: '2026-10-08T23:00:00.000Z',
          scheduledEndAt: '2026-10-09T00:00:00.000Z',
        }),
      ],
    });

    expect(created.status).toBe('DRAFT');
    const rows = await dataSource.query<
      Array<{
        status: string;
        session_type: string;
        subject_id: string;
        distance_m: string | null;
        target_time_ms: string | null;
      }>
    >(
      `SELECT s.status, s.session_type, s.subject_id, t.distance_m, t.target_time_ms
         FROM training_sessions s
         LEFT JOIN time_trials t ON t.session_id = s.id
        WHERE s.class_id = $1
        ORDER BY s.scheduled_start_at`,
      [created.id],
    );
    expect(rows).toEqual([
      expect.objectContaining({
        status: 'DRAFT',
        session_type: 'REGULAR',
        subject_id: endurance,
        distance_m: null,
      }),
      expect.objectContaining({
        status: 'DRAFT',
        session_type: 'TIME_TRIAL',
        subject_id: trial.id,
      }),
    ]);
    expect(Number(rows[1].distance_m)).toBe(1000);
    expect(rows[1].target_time_ms).toBe('62000');
  });

  it('rejects a session outside the class date range', async () => {
    const plan = await plans.create(trainer, twoPhases());

    await expect(
      classes.create(trainer, {
        code: 'K1',
        name: 'K1',
        planId: plan.id,
        startDate: '2026-10-05',
        sessions: [
          oneSession({
            scheduledStartAt: '2026-12-01T01:00:00.000Z',
            scheduledEndAt: '2026-12-01T02:00:00.000Z',
          }),
        ],
      }),
    ).rejects.toThrow(
      new BadRequestException('Buổi tập phải nằm trong thời gian của lớp'),
    );
    const [{ count }] = await dataSource.query<Array<{ count: string }>>(
      'SELECT count(*) FROM training_classes',
    );
    expect(count).toBe('0');
  });

  it('rejects a target time on a regular session', async () => {
    const plan = await plans.create(trainer, twoPhases());

    await expect(
      classes.create(trainer, {
        code: 'K1',
        name: 'K1',
        planId: plan.id,
        startDate: '2026-10-05',
        sessions: [oneSession({ targetTimeMs: 60000 })],
      }),
    ).rejects.toThrow('Chỉ môn chạy thử mới có thời gian mục tiêu');
  });

  it('edits the generated time trial config while the session is a draft only', async () => {
    const trial = await subjects.create(manager, {
      name: 'Chạy thử 1200',
      sessionType: TrainingSessionType.TIME_TRIAL,
      intensity: TrainingIntensity.HEAVY,
      plannedDistanceM: 1200,
      targetTimeMs: 75000,
    });
    const plan = await plans.create(trainer, twoPhases());
    const created = await classes.create(trainer, {
      code: 'K1',
      name: 'K1',
      planId: plan.id,
      startDate: '2026-10-05',
      sessions: [
        oneSession({
          subjectId: trial.id,
          plannedDistanceM: 1200,
          targetTimeMs: 75000,
        }),
      ],
    });
    const [{ id: sessionId }] = await dataSource.query<Array<{ id: string }>>(
      'SELECT id FROM training_sessions WHERE class_id = $1',
      [created.id],
    );

    const updated = await timeTrials.update(trainer, sessionId, {
      distanceM: 1000,
      targetTimeMs: null,
    });

    expect(Number(updated.distanceM)).toBe(1000);
    expect(updated.targetTimeMs).toBeNull();

    await dataSource.query(
      "UPDATE training_sessions SET status = 'SCHEDULED' WHERE id = $1",
      [sessionId],
    );
    await expect(
      timeTrials.update(trainer, sessionId, { distanceM: 800 }),
    ).rejects.toThrow(ConflictException);
  });
});

import { HttpException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { UserRole } from '../../src/common/enums/role.enum';
import type { Actor } from '../../src/common/types/actor';
import { AuditService } from '../../src/modules/audit/services/audit.service';
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
import { fixtures } from './fixtures';
import {
  startTestPostgres,
  stopTestPostgres,
  truncateAllTables,
  type TestPostgres,
} from './postgres';

type Outcome = number | string;

const outcomeOf = (error: unknown): Outcome => {
  if (error instanceof HttpException) return error.getStatus();
  const raw = error as {
    constructor?: { name: string };
    driverError?: { code?: string };
  };
  return `${raw?.constructor?.name}(${raw?.driverError?.code ?? '-'})`;
};

const settle = (operation: Promise<unknown>): Promise<Outcome> =>
  operation.then(() => 'ok', outcomeOf);

describe('Training plans and classes under concurrent writes (Postgres)', () => {
  let db: TestPostgres;
  let dataSource: DataSource;
  let seed: ReturnType<typeof fixtures>;
  let plans: TrainingPlansService;
  let classes: TrainingClassesService;
  let subjects: TrainingSubjectsService;
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
      new AuditService(),
    );
    classes = new TrainingClassesService(
      dataSource.getRepository(TrainingClassEntity),
      access,
      dataSource,
      new AuditService(),
    );
    subjects = new TrainingSubjectsService(
      dataSource.getRepository(TrainingSubjectEntity),
      access,
      dataSource,
      new AuditService(),
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
    const subject = async (name: string) =>
      (
        await subjects.create(manager, {
          name,
          sessionType: TrainingSessionType.REGULAR,
          intensity: TrainingIntensity.LIGHT,
          plannedDistanceM: 2000,
          durationMinutes: 60,
        })
      ).id;
    endurance = await subject('Sức bền');
    sprint = await subject('Nước rút');
  });

  const planBody = (subjectIds: string[]) => ({
    name: 'Giáo án',
    phases: [
      {
        weeks: 2,
        subjects: subjectIds.map((subjectId) => ({
          subjectId,
          minSessionsPerWeek: 2,
        })),
      },
    ],
  });

  const classBody = (planId: string, code = 'K1') => ({
    code,
    name: code,
    planId,
    startDate: '2099-10-05',
  });

  const waitBlocked = async () => {
    for (let i = 0; i < 300; i++) {
      const [row] = await dataSource.query<{ n: number }[]>(
        `SELECT count(*)::int AS n FROM pg_stat_activity
          WHERE datname = current_database() AND wait_event_type = 'Lock'`,
      );
      if (row.n >= 1) return;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    throw new Error('setup: expected a transaction waiting on a lock');
  };

  /** Chạy SQL trong một transaction chưa commit, chạy thao tác tới khi nó chờ khóa, rồi commit */
  const whileUncommitted = async (
    statements: Array<[string, unknown[]]>,
    operation: () => Promise<unknown>,
  ): Promise<Outcome> => {
    const holder = dataSource.createQueryRunner();
    await holder.connect();
    await holder.startTransaction();
    let running: Promise<Outcome> | undefined;
    try {
      for (const [sql, params] of statements) await holder.query(sql, params);
      running = settle(operation());
      await waitBlocked();
      await holder.commitTransaction();
    } finally {
      if (holder.isTransactionActive) await holder.rollbackTransaction();
      await holder.release();
    }
    return running;
  };

  const deleteSubject = (id: string): Array<[string, unknown[]]> => [
    ['SELECT 1 FROM training_subjects WHERE id = $1 FOR UPDATE', [id]],
    ['DELETE FROM training_subjects WHERE id = $1', [id]],
  ];

  const deletePlan = (id: string): Array<[string, unknown[]]> => [
    ['SELECT 1 FROM training_plans WHERE id = $1 FOR UPDATE', [id]],
    ['DELETE FROM training_plans WHERE id = $1', [id]],
  ];

  const insertClass = (
    planId: string,
    code: string,
  ): Array<[string, unknown[]]> => [
    [
      `INSERT INTO training_classes (id, version, name, code, head_trainer_id, plan_id, start_date, end_date, status)
       VALUES ($1, 1, 'Giữ chỗ', $2, $3, $4, '2099-10-05', '2099-10-18', 'ACTIVE')`,
      [randomUUID(), code, trainerId, planId],
    ],
  ];

  it('names the class code unique constraint UQ_training_classes_code', async () => {
    const rows = await dataSource.query<{ conname: string }[]>(
      `SELECT conname FROM pg_constraint
        WHERE conrelid = 'training_classes'::regclass AND contype = 'u'`,
    );
    expect(rows.map((row) => row.conname)).toEqual([
      'UQ_training_classes_code',
    ]);
  });

  it('answers 409 to a class created with a code another class is taking at the same moment', async () => {
    const plan = await plans.create(trainer, planBody([endurance]));

    const outcome = await whileUncommitted(insertClass(plan.id, 'K1'), () =>
      classes.create(trainer, classBody(plan.id, 'K1')),
    );

    expect(outcome).toBe(409);
  });

  it('answers 409 to a class renamed to a code another class is taking at the same moment', async () => {
    const plan = await plans.create(trainer, planBody([endurance]));
    const created = await classes.create(trainer, classBody(plan.id, 'K1'));

    const outcome = await whileUncommitted(insertClass(plan.id, 'K2'), () =>
      classes.update(trainer, created.id, { code: 'K2' }),
    );

    expect(outcome).toBe(409);
  });

  it('answers 400 to a plan created with a subject deleted at the same moment', async () => {
    const outcome = await whileUncommitted(deleteSubject(sprint), () =>
      plans.create(trainer, planBody([endurance, sprint])),
    );

    expect(outcome).toBe(400);
  });

  it('answers 400 to a plan updated with a subject deleted at the same moment', async () => {
    const plan = await plans.create(trainer, planBody([endurance]));

    const outcome = await whileUncommitted(deleteSubject(sprint), () =>
      plans.update(trainer, plan.id, planBody([endurance, sprint])),
    );

    expect(outcome).toBe(400);
  });

  it('answers 404 to a class created from a plan deleted at the same moment', async () => {
    const plan = await plans.create(trainer, planBody([endurance]));

    const outcome = await whileUncommitted(deletePlan(plan.id), () =>
      classes.create(trainer, classBody(plan.id)),
    );

    expect(outcome).toBe(404);
  });

  it('answers 409 to deleting a subject a plan being created holds', async () => {
    const phaseId = randomUUID();
    const planId = randomUUID();

    const outcome = await whileUncommitted(
      [
        ['SELECT 1 FROM training_subjects WHERE id = $1 FOR SHARE', [sprint]],
        [
          `INSERT INTO training_plans (id, version, name, head_trainer_id) VALUES ($1, 1, 'Giáo án', $2)`,
          [planId, trainerId],
        ],
        [
          `INSERT INTO training_plan_phases (id, plan_id, position, weeks) VALUES ($1, $2, 1, 1)`,
          [phaseId, planId],
        ],
        [
          `INSERT INTO training_plan_subjects (id, phase_id, subject_id, min_sessions_per_week) VALUES ($1, $2, $3, 1)`,
          [randomUUID(), phaseId, sprint],
        ],
      ],
      () => subjects.remove(manager, sprint),
    );

    expect(outcome).toBe(409);
  });

  it('answers 409 to deleting a plan a class being created holds', async () => {
    const plan = await plans.create(trainer, planBody([endurance]));

    const outcome = await whileUncommitted(
      [
        ['SELECT 1 FROM training_plans WHERE id = $1 FOR SHARE', [plan.id]],
        ...insertClass(plan.id, 'K1'),
      ],
      () => plans.remove(trainer, plan.id),
    );

    expect(outcome).toBe(409);
  });

  it('updates a plan without waiting for a class being inserted from it', async () => {
    const plan = await plans.create(trainer, planBody([endurance]));
    const holder = dataSource.createQueryRunner();
    await holder.connect();
    await holder.startTransaction();
    try {
      for (const [sql, params] of insertClass(plan.id, 'K1')) {
        await holder.query(sql, params);
      }
      const outcome = await Promise.race([
        settle(plans.update(trainer, plan.id, planBody([sprint]))),
        new Promise<Outcome>((resolve) =>
          setTimeout(() => resolve('blocked'), 2000),
        ),
      ]);

      expect(outcome).toBe('ok');
    } finally {
      await holder.rollbackTransaction();
      await holder.release();
    }
  });

  it('keeps every subject a session can use pinned by the class phases, so it cannot be deleted', async () => {
    const plan = await plans.create(trainer, planBody([endurance]));
    await classes.create(trainer, classBody(plan.id));
    await plans.update(trainer, plan.id, planBody([sprint]));

    await expect(subjects.remove(manager, endurance)).rejects.toMatchObject({
      status: 409,
    });
    await expect(
      dataSource.query('DELETE FROM training_subjects WHERE id = $1', [
        endurance,
      ]),
    ).rejects.toMatchObject({
      driverError: {
        code: '23503',
        constraint: 'FK_training_class_phase_subjects_subject',
      },
    });
  });
});

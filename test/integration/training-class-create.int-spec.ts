import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { UserRole } from '../../src/common/enums/role.enum';
import type { Actor } from '../../src/common/types/actor';
import { HorseAccessService } from '../../src/modules/horses/shared/horse-access.service';
import { TrainingClassEntity } from '../../src/modules/training/entities/training-class.entity';
import { TrainingPlanEntity } from '../../src/modules/training/entities/training-plan.entity';
import { TrainingSubjectEntity } from '../../src/modules/training/entities/training-subject.entity';
import { TrainingClassStatus } from '../../src/modules/training/enums/training-class-status.enum';
import { TrainingIntensity } from '../../src/modules/training/enums/training-intensity.enum';
import { TrainingSessionType } from '../../src/modules/training/enums/training-session-type.enum';
import { TrainingAccessService } from '../../src/modules/training/shared/training-access.service';
import { TrainingClassesService } from '../../src/modules/training/training-classes/services/training-classes.service';
import { TrainingPlansService } from '../../src/modules/training/training-plans/training-plans.service';
import { TrainingSubjectsService } from '../../src/modules/training/training-subjects/training-subjects.service';
import { TrainingPlanMinSessions1789827000000 } from '../../src/migrations/1789827000000-TrainingPlanMinSessions';
import { fixtures } from './fixtures';
import {
  startTestPostgres,
  stopTestPostgres,
  truncateAllTables,
  type TestPostgres,
} from './postgres';
import { AuditService } from '../../src/modules/audit/services/audit.service';

describe('Creating a class from a plan (Postgres)', () => {
  let db: TestPostgres;
  let dataSource: DataSource;
  let seed: ReturnType<typeof fixtures>;
  let plans: TrainingPlansService;
  let classes: TrainingClassesService;
  let subjects: TrainingSubjectsService;
  let manager: Actor;
  let trainer: Actor;
  let endurance: string;
  let walk: string;

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
    trainer = await actorOf(UserRole.HEAD_TRAINER);
    const subject = async (name: string, durationMinutes: number) =>
      (
        await subjects.create(manager, {
          name,
          sessionType: TrainingSessionType.REGULAR,
          intensity: TrainingIntensity.LIGHT,
          plannedDistanceM: 2000,
          durationMinutes,
        })
      ).id;
    endurance = await subject('Sức bền', 60);
    walk = await subject('Đi bộ', 30);
  });

  const createPlan = () =>
    plans.create(trainer, {
      name: 'Hai giai đoạn',
      phases: [
        {
          weeks: 2,
          subjects: [
            { subjectId: endurance, minSessionsPerWeek: 3 },
            { subjectId: walk, minSessionsPerWeek: 2 },
          ],
        },
        { weeks: 1, subjects: [{ subjectId: walk, minSessionsPerWeek: 5 }] },
      ],
    });

  const createClass = (planId: string) =>
    classes.create(trainer, {
      code: 'K1',
      name: 'K1',
      planId,
      startDate: '2027-01-04',
    });

  it('copies the plan phases into a running class with their dates and minimum minutes, without sessions', async () => {
    const created = await createClass((await createPlan()).id);

    expect(created).toMatchObject({
      startDate: '2027-01-04',
      endDate: '2027-01-24',
      status: TrainingClassStatus.ACTIVE,
    });
    const plan = await classes.getPlan(trainer, created.id);
    expect(plan.minTotalMinutes).toBe(2 * (3 * 60 + 2 * 30) + 5 * 30);
    expect(
      plan.phases.map((phase) => [
        phase.position,
        phase.startDate,
        phase.endDate,
        phase.subjects.map((item) => [
          item.subject.name,
          item.minSessionsPerWeek,
        ]),
      ]),
    ).toEqual([
      [
        1,
        '2027-01-04',
        '2027-01-17',
        [
          ['Đi bộ', 2],
          ['Sức bền', 3],
        ],
      ],
      [2, '2027-01-18', '2027-01-24', [['Đi bộ', 5]]],
    ]);
    const [{ count }] = await dataSource.query<Array<{ count: string }>>(
      'SELECT count(*) FROM training_sessions',
    );
    expect(count).toBe('0');
  });

  it('keeps the class copy when the plan is edited later, also when moving the start date', async () => {
    const plan = await createPlan();
    const created = await createClass(plan.id);

    await plans.update(trainer, plan.id, {
      name: 'Một giai đoạn dài',
      phases: [
        {
          weeks: 8,
          subjects: [{ subjectId: endurance, minSessionsPerWeek: 1 }],
        },
      ],
    });
    const moved = await classes.update(trainer, created.id, {
      startDate: '2027-02-01',
    });

    expect(moved.endDate).toBe('2027-02-21');
    const copy = await classes.getPlan(trainer, created.id);
    expect(copy.phases.map((phase) => phase.weeks)).toEqual([2, 1]);
    expect(copy.phases[0].startDate).toBe('2027-02-01');
  });

  it('refuses to delete a subject still used by a class copy', async () => {
    const plan = await createPlan();
    await createClass(plan.id);
    await plans.update(trainer, plan.id, {
      name: 'Bỏ đi bộ',
      phases: [
        {
          weeks: 1,
          subjects: [{ subjectId: endurance, minSessionsPerWeek: 1 }],
        },
      ],
    });

    await expect(subjects.remove(manager, walk)).rejects.toThrow(
      'Môn học đang được dùng, không xóa được',
    );
  });

  it('shows the weekly progress of the schedule against the minimum sessions', async () => {
    const created = await createClass((await createPlan()).id);
    const add = (subjectId: string, start: string, status = 'SCHEDULED') =>
      dataSource.query(
        `INSERT INTO training_sessions (id, version, class_id, subject_id, name, scheduled_start_at, scheduled_end_at, status, intensity, planned_distance_m)
         VALUES ($1, 1, $2, $3, 'Buổi', $4::timestamptz, $4::timestamptz + interval '1 hour', $5, 'LIGHT', 2000)`,
        [randomUUID(), created.id, subjectId, start, status],
      );
    await add(endurance, '2027-01-04T01:00:00Z');
    await add(endurance, '2027-01-10T16:30:00Z');
    await add(endurance, '2027-01-10T17:30:00Z');
    await add(walk, '2027-01-05T01:00:00Z', 'CANCELLED');

    const progress = await classes.getProgress(trainer, created.id);

    expect(progress).toMatchObject({
      minTotalMinutes: 2 * (3 * 60 + 2 * 30) + 5 * 30,
      scheduledMinutes: 3 * 60,
    });
    expect(
      progress.weeks.map((week) => [
        week.week,
        week.phasePosition,
        week.startDate,
        week.subjects.map((item) => [
          item.subjectName,
          item.scheduledSessions,
          item.minSessions,
        ]),
      ]),
    ).toEqual([
      [
        1,
        1,
        '2027-01-04',
        [
          ['Sức bền', 2, 3],
          ['Đi bộ', 0, 2],
        ],
      ],
      [
        2,
        1,
        '2027-01-11',
        [
          ['Sức bền', 1, 3],
          ['Đi bộ', 0, 2],
        ],
      ],
      [3, 2, '2027-01-18', [['Đi bộ', 0, 5]]],
    ]);
  });

  it('marks the open sessions of a cancelled class with the class cancel reason', async () => {
    const created = await createClass((await createPlan()).id);
    await dataSource.query(
      `INSERT INTO training_sessions (id, version, class_id, subject_id, name, scheduled_start_at, scheduled_end_at, status, intensity, planned_distance_m)
       VALUES ($1, 1, $2, $3, 'Buổi', '2027-01-05T01:00:00Z', '2027-01-05T02:00:00Z', 'SCHEDULED', 'LIGHT', 2000)`,
      [randomUUID(), created.id, endurance],
    );

    await classes.updateStatus(trainer, created.id, {
      status: TrainingClassStatus.CANCELLED,
      cancelReason: 'Thôi',
    });

    await expect(
      dataSource.query(
        'SELECT status, cancel_reason FROM training_sessions WHERE class_id = $1',
        [created.id],
      ),
    ).resolves.toEqual([
      { status: 'CANCELLED', cancel_reason: 'Lớp bị hủy: Thôi' },
    ]);
  });

  describe('TrainingPlanMinSessions migration', () => {
    const migration = new TrainingPlanMinSessions1789827000000();

    it('turns weekdays into a minimum count and copies the plan of existing classes', async () => {
      const runner = dataSource.createQueryRunner();
      try {
        await migration.down(runner);
        const trainerId = await seed.user(UserRole.HEAD_TRAINER);
        const planId = randomUUID();
        await runner.query(
          `INSERT INTO training_plans (id, version, name, head_trainer_id) VALUES ($1, 1, 'Cũ', $2)`,
          [planId, trainerId],
        );
        const phaseId = randomUUID();
        await runner.query(
          `INSERT INTO training_plan_phases (id, plan_id, position, weeks) VALUES ($1, $2, 1, 3)`,
          [phaseId, planId],
        );
        await runner.query(
          `INSERT INTO training_plan_subjects (phase_id, subject_id, weekdays) VALUES ($1, $2, '{1,3,5}')`,
          [phaseId, endurance],
        );
        const classId = randomUUID();
        await runner.query(
          `INSERT INTO training_classes (id, version, name, code, head_trainer_id, plan_id, start_date, end_date, status)
           VALUES ($1, 1, 'Cũ', 'OLD', $2, $3, '2027-01-04', '2027-01-24', 'ACTIVE')`,
          [classId, trainerId, planId],
        );

        await migration.up(runner);

        await expect(
          runner.query(
            'SELECT min_sessions_per_week FROM training_plan_subjects WHERE phase_id = $1',
            [phaseId],
          ),
        ).resolves.toEqual([{ min_sessions_per_week: 3 }]);
        await expect(
          runner.query(
            `SELECT p.position, p.weeks, s.subject_id, s.min_sessions_per_week
               FROM training_class_phases p
               JOIN training_class_phase_subjects s ON s.phase_id = p.id
              WHERE p.class_id = $1`,
            [classId],
          ),
        ).resolves.toEqual([
          {
            position: 1,
            weeks: 3,
            subject_id: endurance,
            min_sessions_per_week: 3,
          },
        ]);
      } finally {
        await runner.release();
      }
    });
  });
});

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  ValidationPipe,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { UserRole } from '../../src/common/enums/role.enum';
import type { Actor } from '../../src/common/types/actor';
import { validationExceptionFactory } from '../../src/common/utils/field-errors';
import { SaveTrainingPlanDto } from '../../src/modules/training/dto/training-plan.dto';
import { HorseAccessService } from '../../src/modules/horses/shared/horse-access.service';
import { TrainingClassEntity } from '../../src/modules/training/entities/training-class.entity';
import { TrainingPlanEntity } from '../../src/modules/training/entities/training-plan.entity';
import { TrainingSubjectEntity } from '../../src/modules/training/entities/training-subject.entity';
import { TrainingIntensity } from '../../src/modules/training/enums/training-intensity.enum';
import { TrainingSessionType } from '../../src/modules/training/enums/training-session-type.enum';
import { TrainingClassStatus } from '../../src/modules/training/enums/training-class-status.enum';
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
import { AuditService } from '../../src/modules/audit/services/audit.service';

describe('Training plans and classes built from them (Postgres)', () => {
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
    const subject = (name: string, durationMinutes: number) =>
      subjects.create(manager, {
        name,
        sessionType: TrainingSessionType.REGULAR,
        intensity: TrainingIntensity.MODERATE,
        plannedDistanceM: 3000,
        durationMinutes,
      });
    endurance = (await subject('Sức bền', 60)).id;
    sprint = (await subject('Nước rút', 45)).id;
  });

  const twoPhases = () => ({
    name: 'Chuẩn bị đua 1200m',
    phases: [
      { weeks: 4, subjects: [{ subjectId: endurance, minSessionsPerWeek: 3 }] },
      { weeks: 2, subjects: [{ subjectId: sprint, minSessionsPerWeek: 3 }] },
    ],
  });

  const mixedPhase = () => ({
    name: 'Sức bền xen nước rút',
    phases: [
      {
        weeks: 1,
        subjects: [
          { subjectId: sprint, minSessionsPerWeek: 2 },
          { subjectId: endurance, minSessionsPerWeek: 4 },
        ],
      },
    ],
  });

  const pipe = new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
    exceptionFactory: validationExceptionFactory,
  });

  async function validationFields(
    metatype: typeof SaveTrainingPlanDto,
    value: unknown,
  ): Promise<string[]> {
    try {
      await pipe.transform(value, { type: 'body', metatype });
    } catch (error) {
      const body = (error as BadRequestException).getResponse() as {
        errors: Array<{ field: string }>;
      };
      return body.errors.map((item) => item.field);
    }
    throw new Error('expected validation to fail');
  }

  async function count(table: string): Promise<number> {
    const [row] = await dataSource.query<Array<{ count: string }>>(
      `SELECT count(*) FROM ${table}`,
    );
    return Number(row.count);
  }

  it('creates a plan with phases in order and their start weeks', async () => {
    const plan = await plans.create(trainer, twoPhases());

    expect(plan).toMatchObject({
      headTrainerId: trainerId,
      totalWeeks: 6,
      minTotalMinutes: 4 * 3 * 60 + 2 * 3 * 45,
      phases: [
        {
          position: 1,
          startWeek: 1,
          weeks: 4,
          minTotalMinutes: 4 * 3 * 60,
          subjects: [{ subject: { name: 'Sức bền' }, minSessionsPerWeek: 3 }],
        },
        {
          position: 2,
          startWeek: 5,
          weeks: 2,
          minTotalMinutes: 2 * 3 * 45,
          subjects: [{ subject: { name: 'Nước rút' }, minSessionsPerWeek: 3 }],
        },
      ],
    });
  });

  it('keeps several subjects in one phase, sorted by subject name', async () => {
    const plan = await plans.create(trainer, mixedPhase());

    expect(plan.phases).toHaveLength(1);
    expect(
      plan.phases[0].subjects.map((item) => [
        item.subject.name,
        item.minSessionsPerWeek,
      ]),
    ).toEqual([
      ['Nước rút', 2],
      ['Sức bền', 4],
    ]);
    expect(plan.minTotalMinutes).toBe(2 * 45 + 4 * 60);
  });

  it('replaces the phases on update', async () => {
    const plan = await plans.create(trainer, twoPhases());

    const updated = await plans.update(trainer, plan.id, {
      name: 'Chỉ nước rút',
      phases: [
        { weeks: 3, subjects: [{ subjectId: sprint, minSessionsPerWeek: 2 }] },
      ],
    });

    expect(updated.totalWeeks).toBe(3);
    expect(updated.phases).toHaveLength(1);
    expect(updated.phases[0]).toMatchObject({
      position: 1,
      startWeek: 1,
      weeks: 3,
      subjects: [{ subject: { id: sprint }, minSessionsPerWeek: 2 }],
    });
    expect(updated.phases[0].subjects).toHaveLength(1);
    expect(await count('training_plan_phases')).toBe(1);
    expect(await count('training_plan_subjects')).toBe(1);
  });

  it('rejects a subject repeated in one phase on update and keeps the plan', async () => {
    const plan = await plans.create(trainer, twoPhases());

    await expect(
      plans.update(trainer, plan.id, {
        name: 'Lặp môn',
        phases: [
          {
            weeks: 2,
            subjects: [
              { subjectId: endurance, minSessionsPerWeek: 1 },
              { subjectId: endurance, minSessionsPerWeek: 2 },
            ],
          },
        ],
      }),
    ).rejects.toMatchObject({
      response: {
        message: 'Giai đoạn 1: môn học bị lặp',
        errors: [
          {
            field: 'phases.0.subjects.1.subjectId',
            message: 'Giai đoạn 1: môn học bị lặp',
          },
        ],
      },
    });
    await expect(plans.get(trainer, plan.id)).resolves.toMatchObject({
      name: 'Chuẩn bị đua 1200m',
      totalWeeks: 6,
    });
  });

  it('rejects an unknown subject with 400', async () => {
    await expect(
      plans.create(trainer, {
        name: 'Sai',
        phases: [
          {
            weeks: 1,
            subjects: [
              {
                subjectId: '00000000-0000-4000-8000-000000000000',
                minSessionsPerWeek: 1,
              },
            ],
          },
        ],
      }),
    ).rejects.toThrow(new BadRequestException('Có môn học không tồn tại'));
  });

  it.each([
    ['below 1', 0],
    ['above 14', 15],
    ['missing', undefined],
  ])(
    'rejects a minimum sessions per week %s in the body with 400',
    async (_case, minSessionsPerWeek) => {
      await expect(
        validationFields(SaveTrainingPlanDto, {
          name: 'Sai',
          phases: [
            {
              weeks: 1,
              subjects: [{ subjectId: endurance, minSessionsPerWeek }],
            },
          ],
        }),
      ).resolves.toContain('phases.0.subjects.0.minSessionsPerWeek');
    },
  );

  it('rejects the old weekdays field in the body with 400', async () => {
    await expect(
      validationFields(SaveTrainingPlanDto, {
        name: 'Cũ',
        phases: [
          {
            weeks: 1,
            subjects: [
              { subjectId: endurance, minSessionsPerWeek: 1, weekdays: [1] },
            ],
          },
        ],
      }),
    ).resolves.toEqual(['phases.0.subjects.0.weekdays']);
  });

  it('rejects the old flat subjects body with 400', async () => {
    await expect(
      validationFields(SaveTrainingPlanDto, {
        name: 'Cũ',
        subjects: [{ subjectId: endurance, weeks: 4 }],
      }),
    ).resolves.toEqual(expect.arrayContaining(['subjects', 'phases']));
  });

  it('lets the database refuse a minimum sessions per week out of range', async () => {
    const plan = await plans.create(trainer, twoPhases());
    const [{ id: phaseId }] = await dataSource.query<Array<{ id: string }>>(
      'SELECT id FROM training_plan_phases WHERE plan_id = $1 AND position = 2',
      [plan.id],
    );
    for (const value of [0, 15]) {
      await expect(
        dataSource.query(
          `INSERT INTO training_plan_subjects (phase_id, subject_id, min_sessions_per_week)
           VALUES ($1, $2, $3)`,
          [phaseId, endurance, value],
        ),
      ).rejects.toThrow(/training_plan_subjects_min_sessions_ck/);
    }
  });

  it('deletes the phases and their subjects with the plan', async () => {
    const plan = await plans.create(trainer, mixedPhase());

    await plans.remove(trainer, plan.id);

    expect(await count('training_plans')).toBe(0);
    expect(await count('training_plan_phases')).toBe(0);
    expect(await count('training_plan_subjects')).toBe(0);
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
      }),
    ).rejects.toThrow(
      new BadRequestException(
        'Giáo án không thuộc Huấn luyện viên trưởng phụ trách lớp',
      ),
    );
  });

  it('refuses to delete a plan used by a class', async () => {
    const plan = await plans.create(trainer, twoPhases());
    await classes.create(trainer, {
      code: 'K1',
      name: 'K1',
      planId: plan.id,
      startDate: '2026-10-05',
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

  it('forbids the club manager from managing a class', async () => {
    const plan = await plans.create(trainer, twoPhases());
    const created = await classes.create(trainer, {
      code: 'K1',
      name: 'K1',
      planId: plan.id,
      startDate: '2026-10-05',
    });

    await expect(
      classes.updateStatus(manager, created.id, {
        status: TrainingClassStatus.COMPLETED,
      }),
    ).rejects.toThrow(ForbiddenException);
  });

  describe('audit trail', () => {
    const auditsOf = (entityId: string) =>
      dataSource.query<
        Array<{
          actor_id: string | null;
          action: string;
          entity_type: string;
          before_data: Record<string, unknown> | null;
          after_data: Record<string, unknown> | null;
          reason: string | null;
          feature: string | null;
        }>
      >(
        `SELECT actor_id, action, entity_type, before_data, after_data, reason, feature
           FROM audit_logs WHERE entity_id = $1 ORDER BY created_at, id`,
        [entityId],
      );

    it('logs creating, editing and deleting a subject, skipping edits that change nothing', async () => {
      const [managerRow] = await dataSource.query<Array<{ id: string }>>(
        'SELECT id FROM users WHERE keycloak_id = $1',
        [manager.sub],
      );
      const created = await subjects.create(manager, {
        name: 'Phi nước kiệu',
        sessionType: TrainingSessionType.REGULAR,
        intensity: TrainingIntensity.LIGHT,
        plannedDistanceM: 2000,
        durationMinutes: 45,
      });
      await subjects.update(manager, created.id, {
        plannedDistanceM: 2400,
        durationMinutes: 50,
      });
      await subjects.update(manager, created.id, { plannedDistanceM: 2400 });
      await subjects.remove(manager, created.id);

      const rows = await auditsOf(created.id);
      expect(
        rows.map((row) => [row.action, row.before_data, row.after_data]),
      ).toEqual([
        [
          'CREATE',
          null,
          {
            name: 'Phi nước kiệu',
            description: null,
            sessionType: TrainingSessionType.REGULAR,
            intensity: TrainingIntensity.LIGHT,
            plannedDistanceM: 2000,
            durationMinutes: 45,
            surface: null,
            targetTimeMs: null,
          },
        ],
        [
          'UPDATE',
          { plannedDistanceM: 2000, durationMinutes: 45 },
          { plannedDistanceM: 2400, durationMinutes: 50 },
        ],
        ['DELETE', expect.objectContaining({ name: 'Phi nước kiệu' }), null],
      ]);
      expect(
        rows.every(
          (row) =>
            row.actor_id === managerRow.id &&
            row.entity_type === 'TRAINING_SUBJECT' &&
            row.feature === 'TRAIN_SUBJECT',
        ),
      ).toBe(true);
    });

    it('logs the whole plan before and after a replace, and its deletion', async () => {
      const plan = await plans.create(trainer, twoPhases());
      await plans.update(trainer, plan.id, mixedPhase());
      await plans.remove(trainer, plan.id);

      const rows = await auditsOf(plan.id);
      const sorted = [endurance, sprint].sort();
      expect(
        rows.map((row) => [row.action, row.before_data, row.after_data]),
      ).toEqual([
        [
          'CREATE',
          null,
          {
            name: 'Chuẩn bị đua 1200m',
            description: null,
            phases: [
              {
                weeks: 4,
                subjects: [{ subjectId: endurance, minSessionsPerWeek: 3 }],
              },
              {
                weeks: 2,
                subjects: [{ subjectId: sprint, minSessionsPerWeek: 3 }],
              },
            ],
          },
        ],
        [
          'UPDATE',
          expect.objectContaining({ name: 'Chuẩn bị đua 1200m' }),
          {
            name: 'Sức bền xen nước rút',
            description: null,
            phases: [
              {
                weeks: 1,
                subjects: sorted.map((subjectId) =>
                  subjectId === sprint
                    ? { subjectId, minSessionsPerWeek: 2 }
                    : { subjectId, minSessionsPerWeek: 4 },
                ),
              },
            ],
          },
        ],
        ['DELETE', { name: 'Sức bền xen nước rút', description: null }, null],
      ]);
      expect(rows[1].before_data).toEqual(rows[0].after_data);
      expect(rows.every((row) => row.actor_id === trainerId)).toBe(true);
      expect(rows.every((row) => row.feature === 'TRAIN_PLAN')).toBe(true);
    });

    it('logs creating, editing and the status changes of a class', async () => {
      const plan = await plans.create(trainer, twoPhases());
      const created = await classes.create(trainer, {
        code: 'K1',
        name: 'K1',
        planId: plan.id,
        startDate: '2026-10-05',
      });
      await classes.update(trainer, created.id, { maxHorses: 6 });
      await classes.update(trainer, created.id, { maxHorses: 6 });
      await classes.updateStatus(trainer, created.id, {
        status: TrainingClassStatus.CANCELLED,
        cancelReason: 'Thiếu ngựa',
      });

      const rows = await auditsOf(created.id);
      expect(
        rows.map((row) => [
          row.action,
          row.before_data,
          row.after_data,
          row.reason,
        ]),
      ).toEqual([
        [
          'CREATE',
          null,
          {
            code: 'K1',
            name: 'K1',
            description: null,
            raceAptitude: null,
            maxHorses: 10,
            startDate: '2026-10-05',
            endDate: '2026-11-15',
            planId: plan.id,
            status: TrainingClassStatus.ACTIVE,
          },
          null,
        ],
        ['UPDATE', { maxHorses: 10 }, { maxHorses: 6 }, null],
        [
          'UPDATE',
          { status: TrainingClassStatus.ACTIVE },
          { status: TrainingClassStatus.CANCELLED },
          'Thiếu ngựa',
        ],
      ]);
      expect(
        rows.every(
          (row) =>
            row.actor_id === trainerId &&
            row.entity_type === 'TRAINING_CLASS' &&
            row.feature === 'TRAIN_CLASS',
        ),
      ).toBe(true);
    });
  });
});

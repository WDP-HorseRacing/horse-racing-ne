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
});

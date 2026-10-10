import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { UserRole } from '../../src/common/enums/role.enum';
import type { Actor } from '../../src/common/types/actor';
import { HorseLifecycleStatus } from '../../src/modules/horses/enums/horse-status.enum';
import { HorseAccessService } from '../../src/modules/horses/shared/horse-access.service';
import { FeedingMeal } from '../../src/modules/stable/constants/feeding-meal.enum';
import { FeedingPlanStatus } from '../../src/modules/stable/constants/feeding-plan-status.enum';
import { FeedingPlanEntity } from '../../src/modules/stable/entities/feeding-plan.entity';
import { FeedingPlansService } from '../../src/modules/stable/feeding-plans/feeding-plans.service';
import { StableAccessService } from '../../src/modules/stable/shared/stable-access.service';
import { SupplyCategory } from '../../src/modules/supplies/enums/supply-category.enum';
import { fixtures } from './fixtures';
import {
  startTestPostgres,
  stopTestPostgres,
  truncateAllTables,
  type TestPostgres,
} from './postgres';

describe('Feeding plans per horse (Postgres)', () => {
  let db: TestPostgres;
  let dataSource: DataSource;
  let seed: ReturnType<typeof fixtures>;
  let plans: FeedingPlansService;
  let trainer: Actor;
  let otherTrainer: Actor;
  let groom: Actor;
  let otherGroom: Actor;
  let vet: Actor;
  let gio: string;
  let may: string;
  let outside: string;
  let oats: string;
  let hay: string;
  let vitamin: string;
  let bandage: string;

  const actorOf = async (id: string, role: UserRole): Promise<Actor> => {
    const [row] = await dataSource.query<{ keycloak_id: string }[]>(
      'SELECT keycloak_id FROM users WHERE id = $1',
      [id],
    );
    return { sub: row.keycloak_id, roles: [role] };
  };

  const supply = async (name: string, category: SupplyCategory) => {
    const [row] = await dataSource.query<{ id: string }[]>(
      `INSERT INTO supply_items (version, name, category, unit)
       VALUES (1, $1, $2, 'kg') RETURNING id`,
      [name, category],
    );
    return row.id;
  };

  const ration = () => [
    { meal: FeedingMeal.EVENING, supplyItemId: oats, quantity: 2 },
    { meal: FeedingMeal.EARLY_MORNING, supplyItemId: oats, quantity: 2.5 },
    { meal: FeedingMeal.EARLY_MORNING, supplyItemId: hay, quantity: 3 },
  ];

  beforeAll(async () => {
    db = await startTestPostgres();
    dataSource = db.dataSource;
    seed = fixtures(dataSource);
    plans = new FeedingPlansService(
      dataSource.getRepository(FeedingPlanEntity),
      new StableAccessService(new HorseAccessService(dataSource)),
      dataSource,
    );
  });

  afterAll(() => stopTestPostgres(db));

  beforeEach(async () => {
    await truncateAllTables(dataSource);
    const trainerId = await seed.user(UserRole.HEAD_TRAINER);
    const otherTrainerId = await seed.user(UserRole.HEAD_TRAINER);
    const groomId = await seed.user(UserRole.GROOM);
    trainer = await actorOf(trainerId, UserRole.HEAD_TRAINER);
    otherTrainer = await actorOf(otherTrainerId, UserRole.HEAD_TRAINER);
    groom = await actorOf(groomId, UserRole.GROOM);
    otherGroom = await actorOf(await seed.user(UserRole.GROOM), UserRole.GROOM);
    vet = await actorOf(
      await seed.user(UserRole.VETERINARIAN),
      UserRole.VETERINARIAN,
    );
    const barnA = await seed.barn('Khu A');
    const barnB = await seed.barn('Khu B');
    await dataSource.query(
      'UPDATE barns SET head_trainer_id = $1 WHERE id = $2',
      [trainerId, barnA],
    );
    await dataSource.query(
      'UPDATE barns SET head_trainer_id = $1 WHERE id = $2',
      [otherTrainerId, barnB],
    );
    gio = await seed.horse('Gió', { barnId: barnA });
    may = await seed.horse('Mây', { barnId: barnA });
    outside = await seed.horse('Sấm', { barnId: barnB });
    await dataSource.query(
      `INSERT INTO groom_assignments (version, horse_id, groom_id, start_at)
       VALUES (1, $1, $2, now())`,
      [gio, groomId],
    );
    oats = await supply('Yến mạch', SupplyCategory.FEED);
    hay = await supply('Cỏ khô', SupplyCategory.FEED);
    vitamin = await supply('Vitamin E', SupplyCategory.SUPPLEMENT);
    bandage = await supply('Băng quấn', SupplyCategory.EQUIPMENT);
  });

  it('drafts one plan per horse with meals in day order', async () => {
    const created = await plans.create(trainer, {
      horseIds: [may, gio],
      items: ration(),
      note: ' Tuần đầu ',
    });

    expect(created.map((plan) => plan.horseId)).toEqual([may, gio]);
    expect(new Set(created.map((plan) => plan.id)).size).toBe(2);
    expect(created[0]).toMatchObject({
      status: FeedingPlanStatus.DRAFT,
      note: 'Tuần đầu',
      horseName: 'Mây',
    });
    expect(created[0].meals.map((meal) => meal.meal)).toEqual([
      FeedingMeal.EARLY_MORNING,
      FeedingMeal.EVENING,
    ]);
    expect(created[0].meals[0].items.map((item) => item.name)).toEqual([
      'Yến mạch',
      'Cỏ khô',
    ]);
  });

  it('copies the lines of an existing plan', async () => {
    const [source] = await plans.create(trainer, {
      horseIds: [gio],
      items: [
        ...ration(),
        { meal: FeedingMeal.NOON, supplyItemId: vitamin, quantity: 0.01 },
      ],
    });

    const [copy] = await plans.create(trainer, {
      horseIds: [may],
      copyFromPlanId: source.id,
    });

    expect(copy.meals).toEqual(source.meals);
  });

  it('rejects sending both items and a source plan', async () => {
    const [source] = await plans.create(trainer, {
      horseIds: [gio],
      items: ration(),
    });
    await expect(
      plans.create(trainer, {
        horseIds: [may],
        items: ration(),
        copyFromPlanId: source.id,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects equipment in a ration and creates nothing', async () => {
    await expect(
      plans.create(trainer, {
        horseIds: [gio],
        items: [{ meal: FeedingMeal.NOON, supplyItemId: bandage, quantity: 1 }],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(await dataSource.query('SELECT id FROM feeding_plans')).toEqual([]);
  });

  it('rejects the whole batch when one horse is outside the barn', async () => {
    await expect(
      plans.create(trainer, { horseIds: [gio, outside], items: ration() }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(await dataSource.query('SELECT id FROM feeding_plans')).toEqual([]);
  });

  it.each([
    [HorseLifecycleStatus.TRANSFERRED, ConflictException],
    [HorseLifecycleStatus.DECEASED, ConflictException],
  ])('blocks a %s horse', async (lifecycle, error) => {
    await dataSource.query(
      'UPDATE horses SET lifecycle_status = $1 WHERE id = $2',
      [lifecycle, gio],
    );
    await expect(
      plans.create(trainer, { horseIds: [gio], items: ration() }),
    ).rejects.toBeInstanceOf(error);
  });

  it('still feeds a retired horse', async () => {
    await dataSource.query(
      'UPDATE horses SET lifecycle_status = $1 WHERE id = $2',
      [HorseLifecycleStatus.RETIRED, gio],
    );
    const [draft] = await plans.create(trainer, {
      horseIds: [gio],
      items: ration(),
    });
    expect((await plans.approve(trainer, draft.id)).status).toBe(
      FeedingPlanStatus.ACTIVE,
    );
  });

  it('blocks a horse without a barn with 409', async () => {
    const homeless = await seed.horse('Lạc');
    await expect(
      plans.create(trainer, { horseIds: [homeless], items: ration() }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('treats a deleted horse as missing', async () => {
    await dataSource.query(
      'UPDATE horses SET deleted_at = now() WHERE id = $1',
      [gio],
    );
    await expect(
      plans.create(trainer, { horseIds: [gio], items: ration() }),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(plans.listForHorse(trainer, gio, {})).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('returns 404 for a plan that does not exist', async () => {
    const missing = '00000000-0000-4000-8000-000000000000';
    await expect(
      plans.replace(trainer, missing, { items: ration() }),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(plans.approve(trainer, missing)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('archives the previous active plan on approval', async () => {
    const [first] = await plans.create(trainer, {
      horseIds: [gio],
      items: ration(),
    });
    await plans.approve(trainer, first.id);
    const [second] = await plans.create(trainer, {
      horseIds: [gio],
      items: ration(),
    });

    const approved = await plans.approve(trainer, second.id);

    expect(approved.status).toBe(FeedingPlanStatus.ACTIVE);
    expect(approved.approver).not.toBeNull();
    const old = await plans.get(trainer, first.id);
    expect(old.status).toBe(FeedingPlanStatus.ARCHIVED);
    expect(old.archivedAt).not.toBeNull();
    await expect(plans.approve(trainer, first.id)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('keeps one active plan when several drafts are approved at once', async () => {
    const drafts = await plans.create(trainer, {
      horseIds: [gio],
      items: ration(),
    });
    for (let i = 0; i < 5; i += 1) {
      drafts.push(
        ...(await plans.create(trainer, { horseIds: [gio], items: ration() })),
      );
    }

    await Promise.all(drafts.map((draft) => plans.approve(trainer, draft.id)));

    const rows = await dataSource.query<{ status: string; total: number }[]>(
      `SELECT status, COUNT(*)::int AS total FROM feeding_plans
        WHERE horse_id = $1 GROUP BY status ORDER BY status`,
      [gio],
    );
    expect(rows).toEqual([
      { status: FeedingPlanStatus.ACTIVE, total: 1 },
      { status: FeedingPlanStatus.ARCHIVED, total: 5 },
    ]);
  });

  it('blocks approval while a listed supply was deleted', async () => {
    const [draft] = await plans.create(trainer, {
      horseIds: [gio],
      items: ration(),
    });
    await dataSource.query(
      'UPDATE supply_items SET deleted_at = now() WHERE id = $1',
      [hay],
    );

    await expect(plans.approve(trainer, draft.id)).rejects.toThrow('Cỏ khô');
    const shown = await plans.get(trainer, draft.id);
    expect(shown.meals[0].items.map((item) => item.name)).toContain('Cỏ khô');
  });

  it('only edits and deletes drafts, and only in the trainer barn', async () => {
    const [draft] = await plans.create(trainer, {
      horseIds: [gio],
      items: ration(),
      note: 'cũ',
    });

    await expect(
      plans.replace(otherTrainer, draft.id, { items: ration() }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    const replaced = await plans.replace(trainer, draft.id, {
      items: [{ meal: FeedingMeal.NOON, supplyItemId: oats, quantity: 4 }],
      note: null,
    });
    expect(replaced.note).toBeNull();
    expect(replaced.meals).toEqual([
      {
        meal: FeedingMeal.NOON,
        items: [expect.objectContaining({ quantity: '4.00' })],
      },
    ]);

    await plans.approve(trainer, draft.id);
    await expect(plans.remove(trainer, draft.id)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('removes a draft with its lines', async () => {
    const [draft] = await plans.create(trainer, {
      horseIds: [gio],
      items: ration(),
    });
    await plans.remove(trainer, draft.id);

    await expect(plans.get(trainer, draft.id)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(await dataSource.query('SELECT id FROM feeding_plan_items')).toEqual(
      [],
    );
  });

  describe('who sees what', () => {
    let draftId: string;
    let activeId: string;

    beforeEach(async () => {
      const [active] = await plans.create(trainer, {
        horseIds: [gio],
        items: ration(),
      });
      await plans.approve(trainer, active.id);
      const [draft] = await plans.create(trainer, {
        horseIds: [gio],
        items: ration(),
      });
      activeId = active.id;
      draftId = draft.id;
    });

    it('shows the trainer and vet the whole history', async () => {
      expect(await plans.listForHorse(trainer, gio, {})).toHaveLength(2);
      expect(
        await plans.listForHorse(vet, gio, {
          status: FeedingPlanStatus.DRAFT,
        }),
      ).toHaveLength(1);
    });

    it('shows the assigned groom only the active plan', async () => {
      const listed = await plans.listForHorse(groom, gio, {
        status: FeedingPlanStatus.DRAFT,
      });
      expect(listed.map((plan) => plan.id)).toEqual([activeId]);
      await expect(plans.get(groom, draftId)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('hides the plans from a groom and trainer outside the horse', async () => {
      await expect(
        plans.listForHorse(otherGroom, gio, {}),
      ).rejects.toBeInstanceOf(ForbiddenException);
      await expect(plans.get(otherTrainer, activeId)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('refuses copying from a horse outside the trainer barn', async () => {
      await expect(
        plans.create(otherTrainer, {
          horseIds: [outside],
          copyFromPlanId: activeId,
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });
});

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, EntityManager, Repository } from 'typeorm';
import type { Actor } from '../../../common/types/actor';
import { UserRole } from '../../../common/enums/role.enum';
import { AuditAction } from '../../audit/constants/audit-action.enum';
import { AuditEntityType } from '../../audit/constants/audit-entity-type.enum';
import { AuditFeature } from '../../audit/constants/audit-feature.enum';
import { SupplyItemEntity } from '../../supplies/entities/supply-item.entity';
import { SupplyCategory } from '../../supplies/enums/supply-category.enum';
import { FeedingMeal } from '../constants/feeding-meal.enum';
import { FeedingPlanStatus } from '../constants/feeding-plan-status.enum';
import {
  CreateFeedingPlansDto,
  ReplaceFeedingPlanDto,
} from '../dto/feeding-plan.dto';
import { FeedingPlanItemEntity } from '../entities/feeding-plan-item.entity';
import { FeedingPlanEntity } from '../entities/feeding-plan.entity';
import { StableAccessService } from '../shared/stable-access.service';
import { FeedingPlansService } from './feeding-plans.service';

jest.mock('../../../users/utils/current-user', () => ({
  currentUserForActor: jest.fn().mockResolvedValue({
    id: 'trainer-1',
    role: UserRole.HEAD_TRAINER,
    fullName: 'Huấn luyện viên',
  }),
}));

describe('FeedingPlansService', () => {
  const caller = { id: 'trainer-1' };
  const headTrainer: Actor = {
    sub: 'kc-trainer',
    roles: [UserRole.HEAD_TRAINER],
  };
  const groom: Actor = { sub: 'kc-groom', roles: [UserRole.GROOM] };
  const feed = {
    id: 'feed-1',
    name: 'Yến mạch',
    category: SupplyCategory.FEED,
    unit: 'kg',
  };
  const supplement = {
    id: 'supplement-1',
    name: 'Vitamin',
    category: SupplyCategory.SUPPLEMENT,
    unit: 'gói',
  };

  let manager: Record<string, jest.Mock>;
  let transaction: jest.Mock;
  let plans: { find: jest.Mock };
  let access: {
    findHorseForDailyCare: jest.Mock;
    isGroomOnly: jest.Mock;
    lockOperableHorse: jest.Mock;
  };
  let audit: { record: jest.Mock };
  let queryBuilder: Record<string, jest.Mock>;
  let plan: Record<string, any>;
  let planItems: Record<string, any>[];
  let supplies: Record<string, any>[];
  let service: FeedingPlansService;

  const makePlan = (
    id = 'plan-1',
    horseId = 'horse-1',
    status = FeedingPlanStatus.DRAFT,
  ) => ({
    id,
    horseId,
    horse: { id: horseId, name: 'Mây' },
    status,
    note: 'Khẩu phần thử',
    createdBy: caller.id,
    creator: { id: caller.id, fullName: 'Huấn luyện viên' },
    approvedBy: null,
    approver: null,
    approvedAt: null,
    archivedAt: null,
    createdAt: new Date('2026-11-01T00:00:00.000Z'),
    updatedAt: new Date('2026-11-01T00:00:00.000Z'),
    items: [
      {
        meal: FeedingMeal.NOON,
        supplyItemId: feed.id,
        quantity: '2.50',
        note: null,
        position: 0,
        supplyItem: feed,
      },
    ],
  });

  beforeEach(() => {
    plan = makePlan();
    planItems = [
      {
        planId: plan.id,
        meal: FeedingMeal.NOON,
        supplyItemId: feed.id,
        quantity: '2.50',
        note: null,
        position: 0,
      },
    ];
    supplies = [feed, supplement];

    queryBuilder = {};
    for (const method of ['withDeleted', 'innerJoin', 'where', 'orderBy']) {
      queryBuilder[method] = jest.fn(() => queryBuilder);
    }
    queryBuilder.getMany = jest.fn().mockResolvedValue([]);

    manager = {
      find: jest.fn((entity: unknown) =>
        Promise.resolve(
          entity === SupplyItemEntity
            ? supplies
            : entity === FeedingPlanItemEntity
              ? planItems
              : [],
        ),
      ),
      findOne: jest.fn((_entity: unknown, options: { where: { id: string } }) =>
        Promise.resolve(options.where.id === plan.id ? plan : null),
      ),
      findOneBy: jest.fn().mockImplementation(() => Promise.resolve(plan)),
      create: jest.fn((_entity: unknown, row: object) => row),
      save: jest.fn((row: Record<string, any>) =>
        Promise.resolve(
          row.horseId ? { ...row, id: `plan-${row.horseId}` } : row,
        ),
      ),
      insert: jest.fn().mockResolvedValue(undefined),
      delete: jest.fn().mockResolvedValue({ affected: 1 }),
      remove: jest.fn().mockResolvedValue(plan),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
      getRepository: jest.fn(() => ({
        createQueryBuilder: () => queryBuilder,
      })),
    };
    transaction = jest.fn(
      (work: (entityManager: EntityManager) => Promise<unknown>) =>
        work(manager as unknown as EntityManager),
    );
    plans = {
      find: jest
        .fn()
        .mockResolvedValue([
          makePlan('plan-horse-1', 'horse-1'),
          makePlan('plan-horse-2', 'horse-2'),
        ]),
    };
    access = {
      findHorseForDailyCare: jest.fn().mockResolvedValue({ id: 'horse-1' }),
      isGroomOnly: jest.fn().mockReturnValue(false),
      lockOperableHorse: jest.fn().mockResolvedValue({
        id: 'horse-1',
        barnId: 'barn-1',
      }),
    };
    audit = { record: jest.fn().mockResolvedValue(undefined) };

    const dataSource = {
      manager,
      transaction,
    } as unknown as DataSource;
    service = new FeedingPlansService(
      plans as unknown as Repository<FeedingPlanEntity>,
      access as unknown as StableAccessService,
      dataSource,
      audit,
    );
  });

  describe('listForHorse', () => {
    it('checks horse access and filters by the requested status', async () => {
      await service.listForHorse(headTrainer, 'horse-1', {
        status: FeedingPlanStatus.DRAFT,
      });

      expect(access.findHorseForDailyCare).toHaveBeenCalledWith(
        manager,
        headTrainer,
        caller.id,
        'horse-1',
      );
      expect(plans.find).toHaveBeenCalledWith({
        where: { horseId: 'horse-1', status: FeedingPlanStatus.DRAFT },
        relations: {
          horse: true,
          creator: true,
          approver: true,
          items: { supplyItem: true },
        },
        withDeleted: true,
        order: { createdAt: 'DESC', id: 'DESC' },
      });
    });

    it('returns meals in order and forces Groom to see only active plans', async () => {
      access.isGroomOnly.mockReturnValue(true);
      plans.find.mockResolvedValue([
        makePlan('active', 'horse-1', FeedingPlanStatus.ACTIVE),
      ]);

      const result = await service.listForHorse(groom, 'horse-1', {
        status: FeedingPlanStatus.ARCHIVED,
      });

      expect(plans.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { horseId: 'horse-1', status: FeedingPlanStatus.ACTIVE },
        }),
      );
      expect(result[0]).toMatchObject({
        horseName: 'Mây',
        meals: [
          {
            meal: FeedingMeal.NOON,
            items: [{ name: 'Yến mạch', quantity: 2.5, unit: 'kg' }],
          },
        ],
      });
    });
  });

  describe('get', () => {
    it('loads relations and returns the mapped plan', async () => {
      await expect(service.get(headTrainer, plan.id)).resolves.toMatchObject({
        id: plan.id,
        horseName: 'Mây',
        meals: [{ items: [{ supplyItemId: feed.id, quantity: 2.5 }] }],
      });

      expect(manager.findOne).toHaveBeenCalledWith(FeedingPlanEntity, {
        where: { id: plan.id },
        relations: {
          horse: true,
          creator: true,
          approver: true,
          items: { supplyItem: true },
        },
        withDeleted: true,
      });
    });

    it('does not expose a non-active plan to a Groom', async () => {
      access.isGroomOnly.mockReturnValue(true);
      await expect(service.get(groom, plan.id)).rejects.toThrow(
        new ForbiddenException('Groom chỉ xem được khẩu phần đang áp dụng'),
      );
    });

    it('returns not found when the plan is missing', async () => {
      manager.findOne.mockResolvedValue(null);
      await expect(service.get(headTrainer, 'missing')).rejects.toThrow(
        new NotFoundException('Không tìm thấy khẩu phần'),
      );
    });
  });

  describe('create', () => {
    const body: CreateFeedingPlansDto = {
      horseIds: ['horse-2', 'horse-1'],
      note: '  Khẩu phần mới  ',
      items: [
        {
          meal: FeedingMeal.NOON,
          supplyItemId: feed.id,
          quantity: 3.5,
          note: '  Trộn đều  ',
        },
        {
          meal: FeedingMeal.EVENING,
          supplyItemId: supplement.id,
          quantity: 1,
        },
      ],
    };

    it('creates one draft per horse, locks in sorted order and returns input order', async () => {
      const result = await service.create(headTrainer, body);

      expect(
        access.lockOperableHorse.mock.calls.map((call) => call[2]),
      ).toEqual(['horse-1', 'horse-2']);
      expect(manager.insert).toHaveBeenNthCalledWith(1, FeedingPlanItemEntity, [
        {
          planId: 'plan-horse-1',
          meal: FeedingMeal.NOON,
          supplyItemId: feed.id,
          quantity: '3.5',
          note: 'Trộn đều',
          position: 0,
        },
        {
          planId: 'plan-horse-1',
          meal: FeedingMeal.EVENING,
          supplyItemId: supplement.id,
          quantity: '1',
          note: null,
          position: 1,
        },
      ]);
      expect(manager.insert).toHaveBeenCalledTimes(2);
      expect(audit.record).toHaveBeenCalledTimes(2);
      expect(audit.record).toHaveBeenCalledWith(
        manager,
        expect.objectContaining({
          actorId: caller.id,
          action: AuditAction.CREATE,
          entityType: AuditEntityType.FEEDING_PLAN,
          feature: AuditFeature.FEEDING_PLAN,
          after: expect.objectContaining({
            horseId: 'horse-1',
            status: FeedingPlanStatus.DRAFT,
            note: 'Khẩu phần mới',
            items: expect.arrayContaining([
              expect.objectContaining({ quantity: 3.5, note: 'Trộn đều' }),
            ]),
          }),
        }),
      );
      expect(result.map(({ horseId }) => horseId)).toEqual([
        'horse-2',
        'horse-1',
      ]);
    });

    it('requires exactly one source for ration lines before opening a transaction', async () => {
      await expect(
        service.create(headTrainer, { horseIds: ['horse-1'] }),
      ).rejects.toThrow(BadRequestException);
      expect(transaction).not.toHaveBeenCalled();
    });

    it('rejects duplicate items in the same meal without writing', async () => {
      const duplicate = {
        ...body,
        horseIds: ['horse-1'],
        items: [body.items![0], { ...body.items![0] }],
      };
      await expect(service.create(headTrainer, duplicate)).rejects.toThrow(
        new BadRequestException('Bữa Trưa có một vật tư bị nhập hai lần'),
      );
      expect(manager.insert).not.toHaveBeenCalled();
      expect(audit.record).not.toHaveBeenCalled();
    });

    it('rejects a supply that is not feed or supplement', async () => {
      supplies = [{ ...feed, category: SupplyCategory.MEDICINE }];
      await expect(
        service.create(headTrainer, {
          horseIds: ['horse-1'],
          items: [{ ...body.items![0], supplyItemId: feed.id }],
        }),
      ).rejects.toThrow(
        new BadRequestException(
          'Vật tư Yến mạch không phải thức ăn hoặc thực phẩm bổ sung',
        ),
      );
      expect(manager.insert).not.toHaveBeenCalled();
    });

    it('copies source lines by position after checking source horse access', async () => {
      const source: Record<string, any> = makePlan('source-1');
      source.items = [
        {
          meal: FeedingMeal.EVENING,
          supplyItemId: supplement.id,
          quantity: '1.25',
          note: 'Tối',
          position: 1,
          supplyItem: supplement,
        },
        {
          meal: FeedingMeal.NOON,
          supplyItemId: feed.id,
          quantity: '2.00',
          note: null,
          position: 0,
          supplyItem: feed,
        },
      ];
      manager.findOne.mockResolvedValue(source);

      await service.create(headTrainer, {
        horseIds: ['horse-1'],
        copyFromPlanId: source.id,
      });

      expect(access.findHorseForDailyCare).toHaveBeenCalledWith(
        manager,
        headTrainer,
        caller.id,
        source.horseId,
      );
      expect(manager.insert).toHaveBeenCalledWith(FeedingPlanItemEntity, [
        {
          planId: 'plan-horse-1',
          meal: FeedingMeal.NOON,
          supplyItemId: feed.id,
          quantity: '2.00',
          note: null,
          position: 0,
        },
        {
          planId: 'plan-horse-1',
          meal: FeedingMeal.EVENING,
          supplyItemId: supplement.id,
          quantity: '1.25',
          note: 'Tối',
          position: 1,
        },
      ]);
    });

    it('rejects a missing source plan', async () => {
      manager.findOne.mockResolvedValue(null);
      await expect(
        service.create(headTrainer, {
          horseIds: ['horse-1'],
          copyFromPlanId: 'missing',
        }),
      ).rejects.toThrow(
        new NotFoundException('Không tìm thấy khẩu phần nguồn'),
      );
      expect(manager.insert).not.toHaveBeenCalled();
    });
  });

  describe('replace', () => {
    const body: ReplaceFeedingPlanDto = {
      items: [
        {
          meal: FeedingMeal.EARLY_MORNING,
          supplyItemId: supplement.id,
          quantity: 1,
          note: '  Sau khi tập  ',
        },
      ],
      note: '  Ghi chú mới  ',
    };

    it('replaces all items, trims notes and audits before and after values', async () => {
      await service.replace(headTrainer, plan.id, body);

      expect(manager.delete).toHaveBeenCalledWith(FeedingPlanItemEntity, {
        planId: plan.id,
      });
      expect(manager.insert).toHaveBeenCalledWith(FeedingPlanItemEntity, [
        {
          planId: plan.id,
          meal: FeedingMeal.EARLY_MORNING,
          supplyItemId: supplement.id,
          quantity: '1',
          note: 'Sau khi tập',
          position: 0,
        },
      ]);
      expect(plan.note).toBe('Ghi chú mới');
      expect(audit.record).toHaveBeenCalledWith(
        manager,
        expect.objectContaining({
          action: AuditAction.UPDATE,
          entityType: AuditEntityType.FEEDING_PLAN,
          entityId: plan.id,
          feature: AuditFeature.FEEDING_PLAN,
          before: expect.objectContaining({ note: 'Khẩu phần thử' }),
          after: expect.objectContaining({ note: 'Ghi chú mới' }),
        }),
      );
    });

    it('rejects replacing a plan that is no longer a draft', async () => {
      plan.status = FeedingPlanStatus.ACTIVE;
      await expect(service.replace(headTrainer, plan.id, body)).rejects.toThrow(
        ConflictException,
      );
      expect(manager.delete).not.toHaveBeenCalled();
      expect(audit.record).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('removes only a draft and records its previous state', async () => {
      await expect(
        service.remove(headTrainer, plan.id),
      ).resolves.toBeUndefined();

      expect(manager.remove).toHaveBeenCalledWith(plan);
      expect(audit.record).toHaveBeenCalledWith(
        manager,
        expect.objectContaining({
          actorId: caller.id,
          action: AuditAction.DELETE,
          entityType: AuditEntityType.FEEDING_PLAN,
          entityId: plan.id,
          before: {
            horseId: plan.horseId,
            status: FeedingPlanStatus.DRAFT,
            note: plan.note,
          },
          after: null,
          feature: AuditFeature.FEEDING_PLAN,
        }),
      );
    });

    it('rejects a missing plan without deleting anything', async () => {
      manager.findOneBy.mockResolvedValue(null);
      await expect(service.remove(headTrainer, 'missing')).rejects.toThrow(
        NotFoundException,
      );
      expect(manager.remove).not.toHaveBeenCalled();
    });
  });

  describe('approve', () => {
    it('archives the previous active plan, activates the draft and audits the transition', async () => {
      const result = await service.approve(headTrainer, plan.id);

      expect(manager.update).toHaveBeenCalledWith(
        FeedingPlanEntity,
        { horseId: plan.horseId, status: FeedingPlanStatus.ACTIVE },
        {
          status: FeedingPlanStatus.ARCHIVED,
          archivedAt: expect.any(Date),
        },
      );
      expect(plan.status).toBe(FeedingPlanStatus.ACTIVE);
      expect(plan.approvedBy).toBe(caller.id);
      expect(plan.approvedAt).toBeInstanceOf(Date);
      expect(audit.record).toHaveBeenCalledWith(
        manager,
        expect.objectContaining({
          action: AuditAction.UPDATE,
          entityType: AuditEntityType.FEEDING_PLAN,
          entityId: plan.id,
          feature: AuditFeature.FEEDING_PLAN,
          before: { status: FeedingPlanStatus.DRAFT },
          after: {
            status: FeedingPlanStatus.ACTIVE,
            plansArchived: 1,
          },
        }),
      );
      expect(result.status).toBe(FeedingPlanStatus.ACTIVE);
    });

    it('blocks approval while any ration supply has been deleted', async () => {
      queryBuilder.getMany.mockResolvedValue([{ name: 'Thức ăn đã xóa' }]);

      await expect(service.approve(headTrainer, plan.id)).rejects.toThrow(
        new ConflictException(
          'Vật tư đã ngừng dùng: Thức ăn đã xóa. Sửa khẩu phần trước khi duyệt',
        ),
      );
      expect(manager.update).not.toHaveBeenCalled();
      expect(audit.record).not.toHaveBeenCalled();
    });

    it('rejects approval if the plan is no longer a draft', async () => {
      plan.status = FeedingPlanStatus.ARCHIVED;

      await expect(service.approve(headTrainer, plan.id)).rejects.toThrow(
        ConflictException,
      );
      expect(manager.update).not.toHaveBeenCalled();
      expect(audit.record).not.toHaveBeenCalled();
    });
  });
});

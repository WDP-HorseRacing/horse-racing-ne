import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import {
  DataSource,
  EntityManager,
  QueryFailedError,
  Repository,
} from 'typeorm';
import { UserRole } from '../../../common/enums/role.enum';
import { UserStatus } from '../../../common/enums/user-status.enum';
import type { Actor } from '../../../common/types/actor';
import { AuditAction } from '../../audit/constants/audit-action.enum';
import { AuditEntityType } from '../../audit/constants/audit-entity-type.enum';
import { HorseEntity } from '../../horses/entities/horse.entity';
import { HorseLifecycleStatus } from '../../horses/enums/horse-status.enum';
import { HorseAccessService } from '../../horses/shared/horse-access.service';
import { HorsesSharedRepository } from '../../horses/shared/horses-shared.repository';
import { BarnStatus } from '../constants/barn-status.enum';
import { StallStatus } from '../constants/stall-status.enum';
import { UserEntity } from '../../users/entities/user.entity';
import { BarnEntity } from '../entities/barn.entity';
import { StallEntity } from '../entities/stall.entity';
import { StableAccessService } from '../shared/stable-access.service';
import { StableSharedRepository } from '../shared/stable-shared.repository';
import { BarnsService } from './barns.service';

describe('BarnsService', () => {
  let manager: {
    findOne: jest.Mock;
    existsBy: jest.Mock;
    create: jest.Mock;
    query: jest.Mock;
    exists: jest.Mock;
    count: jest.Mock;
    save: jest.Mock;
    softDelete: jest.Mock;
  };
  let barnRepository: {
    find: jest.Mock;
    existsBy: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
  };
  let audit: { record: jest.Mock };
  let service: BarnsService;

  beforeEach(() => {
    manager = {
      findOne: jest.fn(),
      existsBy: jest.fn().mockResolvedValue(false),
      create: jest.fn((_entity: unknown, row: object) => row),
      exists: jest.fn().mockResolvedValue(true),
      count: jest.fn().mockResolvedValue(0),
      save: jest.fn((row: object) => Promise.resolve(row)),
      softDelete: jest.fn().mockResolvedValue({ affected: 1 }),
      query: jest
        .fn()
        .mockResolvedValue([
          { barnId: 'b1', freeStallCount: 2, pendingStallHorseCount: 0 },
        ]),
    };
    barnRepository = {
      find: jest.fn(),
      existsBy: jest.fn().mockResolvedValue(false),
      create: jest.fn((row: object) => row),
      save: jest.fn((row: object) => Promise.resolve({ id: 'b-new', ...row })),
    };
    audit = { record: jest.fn().mockResolvedValue(undefined) };
    const dataSource = {
      manager,
      transaction: jest.fn((work: (m: typeof manager) => Promise<unknown>) =>
        work(manager),
      ),
    } as unknown as DataSource;
    service = new BarnsService(
      barnRepository as unknown as Repository<BarnEntity>,
      dataSource,
      new StableAccessService(
        new HorseAccessService(
          dataSource,
          new HorsesSharedRepository(dataSource),
        ),
      ),
      new StableSharedRepository(),
      audit,
    );
  });

  describe('lockAssignableBarn', () => {
    const lock = () =>
      service.lockAssignableBarn(manager as unknown as EntityManager, 'b1');

    beforeEach(() => {
      manager.findOne.mockResolvedValue({
        id: 'b1',
        status: BarnStatus.ACTIVE,
        headTrainerId: 'ht-1',
      });
    });

    const capacity = (freeStallCount: number, pendingStallHorseCount: number) =>
      manager.query.mockResolvedValue([
        { barnId: 'b1', freeStallCount, pendingStallHorseCount },
      ]);

    it('locks the barn row before counting', async () => {
      await expect(lock()).resolves.toMatchObject({ id: 'b1' });
      expect(manager.findOne).toHaveBeenCalledWith(BarnEntity, {
        where: { id: 'b1' },
        lock: { mode: 'pessimistic_write' },
      });
      expect(manager.query).toHaveBeenCalledWith(expect.any(String), [
        ['b1'],
        StallStatus.AVAILABLE,
        HorseLifecycleStatus.TRANSFERRED,
      ]);
      expect(manager.findOne.mock.invocationCallOrder[0]).toBeLessThan(
        manager.query.mock.invocationCallOrder[0],
      );
    });

    it('rejects a barn whose only free stall is taken by a horse waiting for a stall', async () => {
      capacity(1, 1);
      await expect(lock()).rejects.toThrow(
        new ConflictException(
          'Khu chuồng đã hết chỗ: 1 ô trống nhưng đã có 1 ngựa chờ xếp ô, vui lòng chọn khu khác',
        ),
      );
    });

    it('accepts a barn with more free stalls than horses waiting for a stall', async () => {
      capacity(2, 1);
      await expect(lock()).resolves.toMatchObject({ id: 'b1' });
    });

    it('counts only waiting horses that are not deleted and not transferred', async () => {
      await lock();
      const [sql, params] = manager.query.mock.calls[0] as [string, unknown[]];
      expect(sql).toMatch(/FROM horses h[\s\S]*h\.deleted_at IS NULL/);
      expect(sql).toMatch(/h\.lifecycle_status <> \$3/);
      expect(sql).toMatch(/sa\.horse_id = h\.id\s+AND sa\.end_at IS NULL/);
      expect(params[2]).toBe(HorseLifecycleStatus.TRANSFERRED);
    });

    it('rejects a missing or deleted barn', async () => {
      manager.findOne.mockResolvedValue(null);
      await expect(lock()).rejects.toThrow(NotFoundException);
    });

    it('rejects a barn that is not active', async () => {
      manager.findOne.mockResolvedValue({
        id: 'b1',
        status: BarnStatus.MAINTENANCE,
        headTrainerId: 'ht-1',
      });
      await expect(lock()).rejects.toThrow(ConflictException);
    });

    it('rejects a barn without a head trainer', async () => {
      manager.findOne.mockResolvedValue({
        id: 'b1',
        status: BarnStatus.ACTIVE,
        headTrainerId: null,
      });
      await expect(lock()).rejects.toThrow(
        new ConflictException(
          'Khu chuồng chưa có Head Trainer phụ trách, không xếp ngựa vào được',
        ),
      );
    });

    it('checks that the head trainer is an active HEAD_TRAINER user', async () => {
      await lock();
      expect(manager.exists).toHaveBeenCalledWith(UserEntity, {
        where: {
          id: 'ht-1',
          role: UserRole.HEAD_TRAINER,
          status: UserStatus.ACTIVE,
        },
      });
    });

    it('rejects a barn whose head trainer is no longer an active HEAD_TRAINER', async () => {
      manager.exists.mockResolvedValue(false);
      await expect(lock()).rejects.toThrow(
        new ConflictException(
          'Khu chưa có Head Trainer đang hoạt động phụ trách',
        ),
      );
      expect(manager.query).not.toHaveBeenCalled();
    });

    it('rejects a barn with no free stall', async () => {
      capacity(0, 0);
      await expect(lock()).rejects.toThrow(
        new ConflictException(
          'Khu chuồng đã hết ô trống, vui lòng chọn khu khác',
        ),
      );
    });
  });

  describe('list', () => {
    it('adds the head trainer name, the remaining stall count and the waiting horse count', async () => {
      manager.findOne.mockResolvedValue({
        id: 'user-1',
        status: UserStatus.ACTIVE,
        role: UserRole.CLUB_MANAGER,
      });
      barnRepository.find.mockResolvedValue([
        {
          id: 'b1',
          name: 'A',
          status: BarnStatus.ACTIVE,
          headTrainerId: 'ht-1',
          headTrainer: {
            id: 'ht-1',
            fullName: 'Trainer A',
            role: UserRole.HEAD_TRAINER,
            status: UserStatus.ACTIVE,
          },
        },
        {
          id: 'b2',
          name: 'B',
          status: BarnStatus.ACTIVE,
          headTrainerId: null,
          headTrainer: null,
        },
      ]);
      manager.query.mockResolvedValue([
        { barnId: 'b1', freeStallCount: 2, pendingStallHorseCount: 1 },
        { barnId: 'b2', freeStallCount: 1, pendingStallHorseCount: 3 },
      ]);
      const actor: Actor = { sub: 'kc-cm', roles: [UserRole.CLUB_MANAGER] };
      const result = await service.list(actor);
      expect(result).toMatchObject([
        {
          id: 'b1',
          headTrainerFullName: 'Trainer A',
          hasActiveHeadTrainer: true,
          availableStallCount: 1,
          pendingStallHorseCount: 1,
        },
        {
          id: 'b2',
          headTrainerFullName: null,
          hasActiveHeadTrainer: false,
          availableStallCount: 0,
          pendingStallHorseCount: 3,
        },
      ]);
      expect(result[0]).not.toHaveProperty('headTrainer');
    });

    it.each([
      [
        'a locked head trainer',
        { role: UserRole.HEAD_TRAINER, status: UserStatus.LOCKED },
      ],
      [
        'an inactive head trainer',
        { role: UserRole.HEAD_TRAINER, status: UserStatus.INACTIVE },
      ],
      [
        'a user who is no longer HEAD_TRAINER',
        { role: UserRole.GROOM, status: UserStatus.ACTIVE },
      ],
    ])('keeps the name but flags %s as not active', async (_label, trainer) => {
      manager.findOne.mockResolvedValue({
        id: 'user-1',
        status: UserStatus.ACTIVE,
        role: UserRole.CLUB_MANAGER,
      });
      barnRepository.find.mockResolvedValue([
        {
          id: 'b1',
          name: 'A',
          status: BarnStatus.ACTIVE,
          headTrainerId: 'ht-1',
          headTrainer: { id: 'ht-1', fullName: 'Trainer A', ...trainer },
        },
      ]);
      const actor: Actor = { sub: 'kc-cm', roles: [UserRole.CLUB_MANAGER] };
      await expect(service.list(actor)).resolves.toMatchObject([
        { headTrainerFullName: 'Trainer A', hasActiveHeadTrainer: false },
      ]);
    });
  });

  describe('Club Manager writes', () => {
    const actor: Actor = { sub: 'kc-cm', roles: [UserRole.CLUB_MANAGER] };
    const clubManager = {
      id: 'cm-1',
      status: UserStatus.ACTIVE,
      role: UserRole.CLUB_MANAGER,
    };
    let barn: Record<string, unknown> | null;
    let hasHorses: boolean;
    let hasStalls: boolean;
    let validTrainer: boolean;

    beforeEach(() => {
      barn = {
        id: 'b1',
        name: 'Khu A',
        description: null,
        capacity: 10,
        status: BarnStatus.ACTIVE,
        headTrainerId: 'ht-1',
      };
      hasHorses = false;
      hasStalls = false;
      validTrainer = true;
      manager.findOne.mockImplementation((entity: unknown) =>
        Promise.resolve(entity === BarnEntity ? barn : clubManager),
      );
      manager.exists.mockImplementation((entity: unknown) =>
        Promise.resolve(
          entity === HorseEntity
            ? hasHorses
            : entity === StallEntity
              ? hasStalls
              : validTrainer,
        ),
      );
      manager.count.mockResolvedValue(4);
    });

    describe('create', () => {
      it('rejects a name that is already used', async () => {
        manager.existsBy.mockResolvedValue(true);
        await expect(
          service.create(actor, { name: ' Khu A ' }),
        ).rejects.toThrow(new ConflictException('Tên khu chuồng đã tồn tại'));
        expect(manager.existsBy).toHaveBeenCalledWith(BarnEntity, {
          name: 'Khu A',
        });
        expect(manager.save).not.toHaveBeenCalled();
        expect(audit.record).not.toHaveBeenCalled();
      });

      it('maps a concurrent unique violation on the name to 409', async () => {
        manager.save.mockRejectedValue(
          new QueryFailedError('INSERT', [], {
            code: '23505',
          } as unknown as Error),
        );
        await expect(service.create(actor, { name: 'Khu A' })).rejects.toThrow(
          new ConflictException('Tên khu chuồng đã tồn tại'),
        );
      });

      it('creates an ACTIVE barn without a head trainer', async () => {
        await expect(
          service.create(actor, { name: 'Khu B' }),
        ).resolves.toMatchObject({
          name: 'Khu B',
          status: BarnStatus.ACTIVE,
          headTrainerId: null,
        });
      });

      it('records a CREATE audit with the created fields in the same transaction', async () => {
        manager.save.mockImplementation((row: object) =>
          Promise.resolve({ id: 'b-new', ...row }),
        );
        await service.create(actor, {
          name: ' Khu B ',
          description: ' Gần bãi tập ',
          capacity: 12,
        });
        expect(audit.record).toHaveBeenCalledTimes(1);
        expect(audit.record).toHaveBeenCalledWith(manager, {
          actorId: 'cm-1',
          action: AuditAction.CREATE,
          entityType: AuditEntityType.BARN,
          entityId: 'b-new',
          before: null,
          after: {
            name: 'Khu B',
            description: 'Gần bãi tập',
            capacity: 12,
            status: BarnStatus.ACTIVE,
            headTrainerId: null,
          },
          feature: 'F1.6',
        });
      });
    });

    describe('update', () => {
      it('rejects a barn that does not exist', async () => {
        barn = null;
        await expect(
          service.update(actor, 'b1', { name: 'X' }),
        ).rejects.toThrow(NotFoundException);
        expect(manager.save).not.toHaveBeenCalled();
      });

      it('locks the barn row inside the transaction', async () => {
        await service.update(actor, 'b1', { name: 'Khu A2' });
        expect(manager.findOne).toHaveBeenCalledWith(BarnEntity, {
          where: { id: 'b1' },
          lock: { mode: 'pessimistic_write' },
        });
      });

      it('rejects a head trainer who is not an active HEAD_TRAINER', async () => {
        validTrainer = false;
        await expect(
          service.update(actor, 'b1', { headTrainerId: 'u-9' }),
        ).rejects.toThrow(BadRequestException);
        expect(manager.save).not.toHaveBeenCalled();
      });

      it('maps a unique violation on the name to 409', async () => {
        manager.save.mockRejectedValue(
          new QueryFailedError('UPDATE', [], {
            code: '23505',
          } as unknown as Error),
        );
        await expect(
          service.update(actor, 'b1', { name: 'Khu B' }),
        ).rejects.toThrow(new ConflictException('Tên khu chuồng đã tồn tại'));
      });

      describe('when the barn still has horses', () => {
        beforeEach(() => {
          hasHorses = true;
        });

        it.each([BarnStatus.CLOSED, BarnStatus.MAINTENANCE])(
          'rejects moving the barn to %s',
          async (status) => {
            await expect(
              service.update(actor, 'b1', { status }),
            ).rejects.toThrow(ConflictException);
            expect(manager.save).not.toHaveBeenCalled();
            expect(audit.record).not.toHaveBeenCalled();
          },
        );

        it('rejects removing the head trainer', async () => {
          await expect(
            service.update(actor, 'b1', { headTrainerId: null }),
          ).rejects.toThrow(
            new ConflictException(
              'Khu chuồng còn ngựa, không gỡ Head Trainer phụ trách được',
            ),
          );
          expect(manager.save).not.toHaveBeenCalled();
        });

        it('rejects a capacity below the current stall count', async () => {
          await expect(
            service.update(actor, 'b1', { capacity: 3 }),
          ).rejects.toThrow(ConflictException);
          expect(manager.save).not.toHaveBeenCalled();
        });

        it('allows a capacity equal to the current stall count and a rename', async () => {
          await expect(
            service.update(actor, 'b1', { capacity: 4, name: 'Khu A2' }),
          ).resolves.toMatchObject({ capacity: 4, name: 'Khu A2' });
        });

        it('only counts horses of this barn that are not deleted', async () => {
          await service.update(actor, 'b1', { name: 'Khu A2' });
          expect(manager.exists).toHaveBeenCalledWith(HorseEntity, {
            where: { barnId: 'b1' },
          });
        });
      });

      it('allows closing a barn and removing its head trainer when it has no horse', async () => {
        await expect(
          service.update(actor, 'b1', {
            status: BarnStatus.CLOSED,
            headTrainerId: null,
          }),
        ).resolves.toMatchObject({
          status: BarnStatus.CLOSED,
          headTrainerId: null,
        });
      });

      it('rejects a capacity below the stall count even when the barn has no horse', async () => {
        await expect(
          service.update(actor, 'b1', { capacity: 1 }),
        ).rejects.toThrow(ConflictException);
        expect(manager.save).not.toHaveBeenCalled();
      });

      it('records an UPDATE audit with only the changed fields', async () => {
        await service.update(actor, 'b1', {
          name: 'Khu A2',
          capacity: 10,
          status: BarnStatus.MAINTENANCE,
        });
        expect(audit.record).toHaveBeenCalledWith(manager, {
          actorId: 'cm-1',
          action: AuditAction.UPDATE,
          entityType: AuditEntityType.BARN,
          entityId: 'b1',
          before: { name: 'Khu A', status: BarnStatus.ACTIVE },
          after: { name: 'Khu A2', status: BarnStatus.MAINTENANCE },
          feature: 'F1.6',
        });
      });

      it('skips the write and the audit when nothing changes', async () => {
        await service.update(actor, 'b1', { name: 'Khu A', capacity: 10 });
        expect(manager.save).not.toHaveBeenCalled();
        expect(audit.record).not.toHaveBeenCalled();
      });
    });

    describe('remove', () => {
      it('rejects a barn that does not exist', async () => {
        barn = null;
        await expect(service.remove(actor, 'b1')).rejects.toThrow(
          NotFoundException,
        );
        expect(manager.softDelete).not.toHaveBeenCalled();
      });

      it('rejects a barn that still has horses', async () => {
        hasHorses = true;
        await expect(service.remove(actor, 'b1')).rejects.toThrow(
          new ConflictException('Không thể xóa khu chuồng khi vẫn còn ngựa'),
        );
        expect(manager.softDelete).not.toHaveBeenCalled();
        expect(audit.record).not.toHaveBeenCalled();
      });

      it('rejects a barn that still has stalls', async () => {
        hasStalls = true;
        await expect(service.remove(actor, 'b1')).rejects.toThrow(
          new ConflictException(
            'Không thể xóa khu chuồng khi vẫn còn ô chuồng bên trong',
          ),
        );
        expect(manager.softDelete).not.toHaveBeenCalled();
      });

      it('locks the barn, soft-deletes it and records a DELETE audit', async () => {
        await service.remove(actor, 'b1');
        expect(manager.findOne).toHaveBeenCalledWith(BarnEntity, {
          where: { id: 'b1' },
          lock: { mode: 'pessimistic_write' },
        });
        expect(manager.softDelete).toHaveBeenCalledWith(BarnEntity, {
          id: 'b1',
        });
        expect(audit.record).toHaveBeenCalledWith(
          manager,
          expect.objectContaining({
            action: AuditAction.DELETE,
            entityType: AuditEntityType.BARN,
            entityId: 'b1',
            after: null,
            feature: 'F1.6',
          }),
        );
      });
    });
  });
});

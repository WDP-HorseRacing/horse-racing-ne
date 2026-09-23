import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { UserRole } from '../../../common/enums/role.enum';
import { UserStatus } from '../../../common/enums/user-status.enum';
import type { Actor } from '../../../common/types/actor';
import { AuditAction } from '../../audit/constants/audit-action.enum';
import { AuditEntityType } from '../../audit/constants/audit-entity-type.enum';
import { BarnsService } from '../../stable/barns/barns.service';
import { UserEntity } from '../../users/entities/user.entity';
import { HorseEntity } from '../entities/horse.entity';
import { HorseGender } from '../enums/horse-gender.enum';
import {
  HorseHealthStatus,
  HorseLifecycleStatus,
} from '../enums/horse-status.enum';
import { HorseAccessService } from '../shared/horse-access.service';
import { HorsePedigreeRepository } from '../shared/horse-pedigree.repository';
import { HorsePedigreeService } from '../shared/horse-pedigree.service';
import { HorsesSharedRepository } from '../shared/horses-shared.repository';
import { HorseDeletionsService } from './horse-deletions.service';

type HorseRow = Partial<HorseEntity> & { id: string };

const HORSE_ID = 'h1';
const CALLER_ID = 'cm-1';
const DELETED_MESSAGE =
  'Hồ sơ đã xóa, chỉ xem được. Khôi phục hồ sơ trước khi thao tác';

const matchesParent = (child: HorseRow, where: Partial<HorseEntity>): boolean =>
  ('sireId' in where && child.sireId === where.sireId) ||
  ('damId' in where && child.damId === where.damId);

describe('HorseDeletionsService', () => {
  let horse: HorseRow;
  let children: HorseRow[];
  let horseRepository: {
    update: jest.Mock;
    softDelete: jest.Mock;
    restore: jest.Mock;
    exists: jest.Mock;
  };
  let manager: {
    findOne: jest.Mock;
    query: jest.Mock;
    getRepository: jest.Mock;
  };
  let horses: {
    findById: jest.Mock;
    findByIdWithDeleted: jest.Mock;
    lockHorseWithDeleted: jest.Mock;
    lockActiveHorseOwner: jest.Mock;
  };
  let deletions: { businessDataLabels: jest.Mock };
  let barns: { lockAssignableBarn: jest.Mock };
  let audit: { record: jest.Mock };
  let service: HorseDeletionsService;

  const actor = (): Actor => ({ sub: 'kc-cm', roles: [UserRole.CLUB_MANAGER] });

  beforeEach(() => {
    horse = {
      id: HORSE_ID,
      name: 'Gió',
      gender: HorseGender.MALE,
      microchipId: null,
      ownerId: 'owner-1',
      barnId: 'b1',
      healthStatus: HorseHealthStatus.ELIGIBLE,
      lifecycleStatus: HorseLifecycleStatus.ACTIVE,
      deletedAt: null,
      deletedReason: null,
    };
    children = [];
    horseRepository = {
      update: jest.fn().mockResolvedValue({ affected: 1 }),
      softDelete: jest.fn().mockResolvedValue({ affected: 1 }),
      restore: jest.fn().mockResolvedValue({ affected: 1 }),
      exists: jest.fn(
        (options: { where: Partial<HorseEntity>; withDeleted?: boolean }) =>
          Promise.resolve(
            children.some(
              (child) =>
                (options.withDeleted || !child.deletedAt) &&
                matchesParent(child, options.where),
            ),
          ),
      ),
    };
    manager = {
      findOne: jest.fn((entity: unknown) =>
        Promise.resolve(
          entity === UserEntity
            ? {
                id: CALLER_ID,
                status: UserStatus.ACTIVE,
                role: UserRole.CLUB_MANAGER,
              }
            : null,
        ),
      ),
      query: jest.fn().mockResolvedValue([]),
      getRepository: jest.fn(() => horseRepository),
    };
    const dataSource = {
      manager,
      transaction: jest.fn((work: (m: typeof manager) => Promise<unknown>) =>
        work(manager),
      ),
    };
    horses = {
      findById: jest.fn(() => Promise.resolve(horse)),
      findByIdWithDeleted: jest.fn(() => Promise.resolve(horse)),
      lockHorseWithDeleted: jest.fn(() => Promise.resolve(horse)),
      lockActiveHorseOwner: jest.fn().mockResolvedValue(true),
    };
    deletions = { businessDataLabels: jest.fn().mockResolvedValue([]) };
    barns = { lockAssignableBarn: jest.fn().mockResolvedValue({}) };
    audit = { record: jest.fn().mockResolvedValue(undefined) };
    const typedDataSource = dataSource as unknown as DataSource;
    const sharedRepository = horses as unknown as HorsesSharedRepository;
    service = new HorseDeletionsService(
      deletions,
      sharedRepository,
      new HorseAccessService(typedDataSource, sharedRepository),
      new HorsePedigreeService(new HorsePedigreeRepository(), sharedRepository),
      barns as unknown as BarnsService,
      typedDataSource,
      audit,
    );
  });

  describe('remove', () => {
    const reason = { reason: 'Tạo nhầm' };
    const remove = () => service.remove(actor(), HORSE_ID, reason);

    it('rejects a horse with business data with 409 listing the labels', async () => {
      deletions.businessDataLabels.mockResolvedValue([
        'bệnh án',
        'chỉ số cơ thể',
      ]);
      const result = remove();
      await expect(result).rejects.toThrow(ConflictException);
      await expect(result).rejects.toThrow(/bệnh án, chỉ số cơ thể/);
      expect(manager.query).toHaveBeenCalledWith(
        'SELECT pg_advisory_xact_lock(hashtext($1))',
        ['horses.pedigree'],
      );
      expect(horses.lockHorseWithDeleted).toHaveBeenCalledWith(
        manager,
        HORSE_ID,
      );
      expect(horseRepository.softDelete).not.toHaveBeenCalled();
    });

    it('rejects a horse that is a parent of another horse with 409', async () => {
      children = [{ id: 'foal', damId: HORSE_ID, deletedAt: null }];
      await expect(remove()).rejects.toThrow(
        new ConflictException(
          'Ngựa đang là cha/mẹ trong phả hệ của ngựa khác, không thể xóa',
        ),
      );
      expect(horseRepository.softDelete).not.toHaveBeenCalled();
    });

    it('rejects a horse that is a parent of a soft-deleted horse with 409', async () => {
      children = [
        {
          id: 'foal',
          sireId: HORSE_ID,
          deletedAt: new Date('2026-09-01T00:00:00Z'),
        },
      ];
      await expect(remove()).rejects.toThrow(ConflictException);
      expect(horseRepository.softDelete).not.toHaveBeenCalled();
    });

    it('rejects a TRANSFERRED horse with 409 because its profile is read-only', async () => {
      horse.lifecycleStatus = HorseLifecycleStatus.TRANSFERRED;
      await expect(remove()).rejects.toThrow(ConflictException);
      expect(horseRepository.softDelete).not.toHaveBeenCalled();
    });

    it('returns 404 when the horse is missing', async () => {
      horses.lockHorseWithDeleted.mockResolvedValue(null);
      await expect(remove()).rejects.toThrow(NotFoundException);
    });

    it('rejects deleting a deleted profile again with 403', async () => {
      horse.deletedAt = new Date('2026-09-01T00:00:00Z');
      await expect(remove()).rejects.toThrow(
        new ForbiddenException(DELETED_MESSAGE),
      );
      expect(horseRepository.softDelete).not.toHaveBeenCalled();
      expect(audit.record).not.toHaveBeenCalled();
    });

    it('soft-deletes with the reason and audits DELETE', async () => {
      await remove();
      expect(horseRepository.update).toHaveBeenCalledWith(
        { id: HORSE_ID },
        { deletedReason: 'Tạo nhầm' },
      );
      expect(horseRepository.softDelete).toHaveBeenCalledWith({ id: HORSE_ID });
      expect(audit.record).toHaveBeenCalledWith(
        manager,
        expect.objectContaining({
          action: AuditAction.DELETE,
          entityId: HORSE_ID,
          reason: 'Tạo nhầm',
          feature: 'F1.8',
        }),
      );
    });
  });

  describe('restore', () => {
    const reason = { reason: 'Xóa nhầm' };
    const restore = () => service.restore(actor(), HORSE_ID, reason);
    const deletedAt = new Date('2026-09-01T00:00:00Z');

    beforeEach(() => {
      horse.deletedAt = deletedAt;
      horse.deletedReason = 'Tạo nhầm';
    });

    it('rejects a profile that is not deleted with 409', async () => {
      horse.deletedAt = null;
      await expect(restore()).rejects.toThrow(
        new ConflictException('Hồ sơ ngựa chưa bị xóa'),
      );
      expect(horseRepository.restore).not.toHaveBeenCalled();
    });

    it('returns 404 when there is no profile', async () => {
      horses.lockHorseWithDeleted.mockResolvedValue(null);
      await expect(restore()).rejects.toThrow(NotFoundException);
      expect(horseRepository.restore).not.toHaveBeenCalled();
    });

    it('restores, keeps a valid barn and owner, and audits RESTORE with the reason', async () => {
      await restore();
      expect(horses.lockHorseWithDeleted).toHaveBeenCalledWith(
        manager,
        HORSE_ID,
      );
      expect(barns.lockAssignableBarn).toHaveBeenCalledWith(manager, 'b1');
      expect(horses.lockActiveHorseOwner).toHaveBeenCalledWith(
        manager,
        'owner-1',
      );
      expect(horseRepository.restore).toHaveBeenCalledWith({ id: HORSE_ID });
      expect(horseRepository.update).toHaveBeenCalledWith(
        { id: HORSE_ID },
        { deletedReason: null },
      );
      expect(audit.record).toHaveBeenCalledWith(manager, {
        actorId: CALLER_ID,
        action: AuditAction.RESTORE,
        entityType: AuditEntityType.HORSE,
        entityId: HORSE_ID,
        before: { deletedAt, deletedReason: 'Tạo nhầm' },
        after: { deletedAt: null, deletedReason: null },
        reason: 'Xóa nhầm',
        feature: 'F1.8',
      });
    });

    it.each([
      [
        'full, inactive or without an active head trainer',
        new ConflictException('Khu chuồng đã hết chỗ'),
      ],
      ['deleted', new NotFoundException('Không tìm thấy khu chuồng')],
    ])(
      'clears the barn when the barn is %s and audits it (BA 2026-09-23, Q-1 B)',
      async (_case, error) => {
        barns.lockAssignableBarn.mockRejectedValue(error);
        await restore();
        expect(horseRepository.update).toHaveBeenCalledWith(
          { id: HORSE_ID },
          { deletedReason: null, barnId: null },
        );
        expect(audit.record).toHaveBeenCalledWith(
          manager,
          expect.objectContaining({
            before: expect.objectContaining({ barnId: 'b1' }) as unknown,
            after: expect.objectContaining({ barnId: null }) as unknown,
          }),
        );
      },
    );

    it('does not check a barn for a horse that had none', async () => {
      horse.barnId = null;
      await restore();
      expect(barns.lockAssignableBarn).not.toHaveBeenCalled();
    });

    it('rethrows unexpected barn errors', async () => {
      barns.lockAssignableBarn.mockRejectedValue(new Error('db down'));
      await expect(restore()).rejects.toThrow('db down');
      expect(horseRepository.restore).not.toHaveBeenCalled();
    });

    it('clears an owner who is no longer an active HORSE_OWNER and audits it', async () => {
      horses.lockActiveHorseOwner.mockResolvedValue(false);
      await restore();
      expect(horseRepository.update).toHaveBeenCalledWith(
        { id: HORSE_ID },
        { deletedReason: null, ownerId: null },
      );
      expect(audit.record).toHaveBeenCalledWith(
        manager,
        expect.objectContaining({
          before: expect.objectContaining({ ownerId: 'owner-1' }) as unknown,
          after: expect.objectContaining({ ownerId: null }) as unknown,
        }),
      );
    });

    it('does not check an owner for a horse that had none', async () => {
      horse.ownerId = null;
      await restore();
      expect(horses.lockActiveHorseOwner).not.toHaveBeenCalled();
    });
  });
});

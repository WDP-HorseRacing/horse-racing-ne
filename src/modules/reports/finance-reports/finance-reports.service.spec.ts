import { BadRequestException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { UserRole } from '../../../common/enums/role.enum';
import type { Actor } from '../../../common/types/actor';
import { HorseOwnershipEntity } from '../../horses/entities/horse-ownership.entity';
import { UserEntity } from '../../users/entities/user.entity';
import { currentUserForActor } from '../../users/utils/current-user';
import { FinanceReportsRepository } from './finance-reports.repository';
import { FinanceReportsService } from './finance-reports.service';

jest.mock('../../users/utils/current-user', () => ({
  currentUserForActor: jest.fn(),
}));

describe('FinanceReportsService', () => {
  const managerActor: Actor = {
    sub: 'kc-manager',
    roles: [UserRole.CLUB_MANAGER],
  };
  const ownerActor: Actor = {
    sub: 'kc-owner',
    roles: [UserRole.HORSE_OWNER],
  };
  const managerUser = {
    id: 'manager-1',
    fullName: 'Quản lý',
    role: UserRole.CLUB_MANAGER,
  };
  const ownerUser = {
    id: 'owner-1',
    fullName: 'Chủ ngựa Một',
    role: UserRole.HORSE_OWNER,
  };

  let repository: {
    dailyFees: jest.Mock;
    medicalCharges: jest.Mock;
    surcharges: jest.Mock;
    supplyValues: jest.Mock;
  };
  let manager: { findOne: jest.Mock; exists: jest.Mock };
  let service: FinanceReportsService;

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-11-09T03:00:00.000Z'));
    jest.mocked(currentUserForActor).mockResolvedValue(managerUser as never);
    repository = {
      dailyFees: jest.fn().mockResolvedValue([
        {
          ownerId: 'owner-1',
          ownerName: 'Chủ ngựa Một',
          horseId: 'horse-1',
          horseName: 'Mây',
          billedDays: 2,
          dailyFee: '200',
        },
      ]),
      medicalCharges: jest.fn().mockResolvedValue([
        {
          ownerId: 'owner-1',
          ownerName: 'Chủ ngựa Một',
          horseId: 'horse-1',
          horseName: 'Mây',
          visitCount: 1,
          medicalCost: '50',
        },
      ]),
      surcharges: jest.fn().mockResolvedValue([
        {
          ownerId: null,
          ownerName: null,
          horseId: 'horse-2',
          horseName: 'Gió',
          surcharge: '25',
        },
      ]),
      supplyValues: jest.fn().mockResolvedValue({
        purchased: '1000',
        used: '300',
        inventoryValue: '700',
      }),
    };
    manager = {
      findOne: jest.fn().mockResolvedValue(ownerUser),
      exists: jest.fn().mockResolvedValue(false),
    };
    service = new FinanceReportsService(
      repository as unknown as FinanceReportsRepository,
      { manager } as unknown as DataSource,
    );
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('clubFinance', () => {
    it('aggregates owner, unowned and supply amounts for the requested period', async () => {
      const query = { from: '2026-11-01', to: '2026-11-08' };

      const result = await service.clubFinance(managerActor, query);

      expect(repository.dailyFees).toHaveBeenCalledWith(
        expect.objectContaining(query),
        new Date('2026-11-09T03:00:00.000Z'),
      );
      expect(repository.medicalCharges).toHaveBeenCalledWith(
        expect.objectContaining(query),
      );
      expect(repository.surcharges).toHaveBeenCalledWith(
        expect.objectContaining(query),
        new Date('2026-11-09T03:00:00.000Z'),
      );
      expect(repository.supplyValues).toHaveBeenCalledWith(
        expect.objectContaining(query),
      );
      expect(result).toMatchObject({
        from: query.from,
        to: query.to,
        ownerCharges: {
          dailyFee: 200,
          medicalCost: 50,
          surcharge: 25,
          total: 275,
        },
        supplies: { purchased: 1000, used: 300, inventoryValue: 700 },
        owners: [
          {
            ownerId: 'owner-1',
            ownerName: 'Chủ ngựa Một',
            total: 250,
          },
        ],
        unowned: {
          billedDays: 0,
          dailyFee: 0,
          medicalCost: 0,
          surcharge: 25,
          total: 25,
        },
      });
    });
  });

  describe('ownerCost', () => {
    it('uses the Horse Owner account and ignores a supplied owner id', async () => {
      jest.mocked(currentUserForActor).mockResolvedValue(ownerUser as never);
      repository.dailyFees.mockResolvedValue([
        {
          ownerId: ownerUser.id,
          ownerName: ownerUser.fullName,
          horseId: 'horse-1',
          horseName: 'Mây',
          billedDays: 3,
          dailyFee: '300',
        },
      ]);
      repository.medicalCharges.mockResolvedValue([]);
      repository.surcharges.mockResolvedValue([]);

      const result = await service.ownerCost(ownerActor, {
        from: '2026-11-01',
        to: '2026-11-08',
        ownerId: 'somebody-else',
      });

      expect(manager.findOne).not.toHaveBeenCalled();
      expect(repository.dailyFees).toHaveBeenCalledWith(
        expect.objectContaining({ from: '2026-11-01', to: '2026-11-08' }),
        expect.any(Date),
        ownerUser.id,
      );
      expect(repository.medicalCharges).toHaveBeenCalledWith(
        expect.any(Object),
        ownerUser.id,
      );
      expect(result).toMatchObject({
        ownerId: ownerUser.id,
        ownerName: ownerUser.fullName,
        dailyFee: 300,
        total: 300,
        horses: [{ horseId: 'horse-1', dailyFee: 300, billedDays: 3 }],
      });
    });

    it('requires a target owner for Club Manager reports', async () => {
      await expect(
        service.ownerCost(managerActor, {
          from: '2026-11-01',
          to: '2026-11-08',
        }),
      ).rejects.toThrow(BadRequestException);
      expect(manager.findOne).not.toHaveBeenCalled();
      expect(repository.dailyFees).not.toHaveBeenCalled();
    });

    it('accepts a former owner found through ownership history', async () => {
      manager.findOne.mockResolvedValue({
        id: 'former-owner',
        fullName: 'Chủ cũ',
        role: UserRole.GROOM,
      });
      manager.exists.mockResolvedValue(true);
      repository.dailyFees.mockResolvedValue([]);
      repository.medicalCharges.mockResolvedValue([]);
      repository.surcharges.mockResolvedValue([]);

      await expect(
        service.ownerCost(managerActor, {
          from: '2026-11-01',
          to: '2026-11-08',
          ownerId: 'former-owner',
        }),
      ).resolves.toMatchObject({
        ownerId: 'former-owner',
        ownerName: 'Chủ cũ',
      });
      expect(manager.findOne).toHaveBeenCalledWith(UserEntity, {
        where: { id: 'former-owner' },
        withDeleted: true,
      });
      expect(manager.exists).toHaveBeenCalledWith(HorseOwnershipEntity, {
        where: { ownerId: 'former-owner' },
      });
    });
  });
});

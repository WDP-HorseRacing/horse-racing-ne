import { ConflictException, NotFoundException } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { UserRole } from '../../../common/enums/role.enum';
import { UserStatus } from '../../../common/enums/user-status.enum';
import type { Actor } from '../../../common/types/actor';
import { HorseLifecycleStatus } from '../../horses/enums/horse-status.enum';
import { DELETED_HORSE_READ_ONLY_MESSAGE } from '../../horses/constants/horse.constants';
import { HorseAccessService } from '../../horses/shared/horse-access.service';
import { UserEntity } from '../../users/entities/user.entity';
import { MedicalAccessService } from './medical-access.service';

const vet: Actor = { sub: 'kc-vet', roles: [UserRole.VETERINARIAN] };
const manager = {} as EntityManager;

describe('MedicalAccessService.lockHorseForWrite', () => {
  let horseAccess: {
    lockWritableHorseInScope: jest.Mock;
    findReadableHorseForActor: jest.Mock;
  };
  let service: MedicalAccessService;

  beforeEach(() => {
    horseAccess = {
      lockWritableHorseInScope: jest.fn().mockResolvedValue({
        caller: { id: 'vet-1' },
        horse: { id: 'h1', lifecycleStatus: HorseLifecycleStatus.ACTIVE },
      }),
      findReadableHorseForActor: jest.fn(),
    };
    service = new MedicalAccessService(
      horseAccess as unknown as HorseAccessService,
    );
  });

  it('locks the visible horse inside the given transaction', async () => {
    const result = await service.lockHorseForWrite(manager, vet, 'h1');

    expect(horseAccess.lockWritableHorseInScope).toHaveBeenCalledWith(
      manager,
      vet,
      'h1',
    );
    expect(result.horse.id).toBe('h1');
  });

  it('answers conflict for a transferred horse', async () => {
    horseAccess.lockWritableHorseInScope.mockResolvedValue({
      caller: { id: 'vet-1' },
      horse: { id: 'h1', lifecycleStatus: HorseLifecycleStatus.TRANSFERRED },
    });

    await expect(service.lockHorseForWrite(manager, vet, 'h1')).rejects.toThrow(
      ConflictException,
    );
  });

  it('answers not found for a horse outside the caller scope', async () => {
    horseAccess.lockWritableHorseInScope.mockRejectedValue(new NotFoundException());

    await expect(service.lockHorseForWrite(manager, vet, 'h1')).rejects.toThrow(
      NotFoundException,
    );
  });
});

describe('MedicalAccessService.lockHorseForWrite on a deleted profile', () => {
  let lockHorseWithDeleted: jest.Mock;
  let service: MedicalAccessService;
  const deletedManager = {
    findOne: jest.fn((entity: unknown) =>
      Promise.resolve(
        entity === UserEntity
          ? {
              id: 'u-1',
              status: UserStatus.ACTIVE,
              role: UserRole.VETERINARIAN,
            }
          : null,
      ),
    ),
  } as unknown as EntityManager;

  beforeEach(() => {
    lockHorseWithDeleted = jest.fn().mockResolvedValue({
      id: 'h1',
      lifecycleStatus: HorseLifecycleStatus.ACTIVE,
      deletedAt: new Date('2026-09-01T00:00:00Z'),
    });
    service = new MedicalAccessService(
      Object.assign(
        new HorseAccessService({
          manager: deletedManager,
        } as unknown as DataSource),
        { lockHorseWithDeleted },
      ),
    );
  });

  it('answers not found to a VETERINARIAN', async () => {
    await expect(
      service.lockHorseForWrite(deletedManager, vet, 'h1'),
    ).rejects.toThrow(NotFoundException);
  });

  it('answers conflict to a caller holding CLUB_MANAGER', async () => {
    await expect(
      service.lockHorseForWrite(
        deletedManager,
        {
          sub: 'kc-cm-vet',
          roles: [UserRole.CLUB_MANAGER, UserRole.VETERINARIAN],
        },
        'h1',
      ),
    ).rejects.toThrow(new ConflictException(DELETED_HORSE_READ_ONLY_MESSAGE));
  });
});

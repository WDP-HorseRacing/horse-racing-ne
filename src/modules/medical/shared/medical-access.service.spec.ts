import { ConflictException, NotFoundException } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { UserRole } from '../../../common/enums/role.enum';
import type { Actor } from '../../../common/types/actor';
import { HorseLifecycleStatus } from '../../horses/enums/horse-status.enum';
import { HorseAccessService } from '../../horses/shared/horse-access.service';
import { MedicalAccessService } from './medical-access.service';

const vet: Actor = { sub: 'kc-vet', roles: [UserRole.VETERINARIAN] };
const manager = {} as EntityManager;

describe('MedicalAccessService.lockHorseForWrite', () => {
  let horseAccess: {
    lockVisibleHorse: jest.Mock;
    assertNotTransferred: jest.Mock;
    findReadable: jest.Mock;
  };
  let service: MedicalAccessService;

  beforeEach(() => {
    horseAccess = {
      lockVisibleHorse: jest.fn().mockResolvedValue({
        caller: { id: 'vet-1' },
        horse: { id: 'h1', lifecycleStatus: HorseLifecycleStatus.ACTIVE },
      }),
      assertNotTransferred: jest.fn(),
      findReadable: jest.fn(),
    };
    service = new MedicalAccessService(
      horseAccess as unknown as HorseAccessService,
    );
  });

  it('locks the visible horse inside the given transaction', async () => {
    const result = await service.lockHorseForWrite(manager, vet, 'h1');

    expect(horseAccess.lockVisibleHorse).toHaveBeenCalledWith(
      vet,
      'h1',
      manager,
    );
    expect(result.horse.id).toBe('h1');
  });

  it('answers conflict for a transferred horse', async () => {
    horseAccess.assertNotTransferred.mockImplementation(() => {
      throw new ConflictException();
    });

    await expect(service.lockHorseForWrite(manager, vet, 'h1')).rejects.toThrow(
      ConflictException,
    );
  });

  it('answers not found for a horse outside the caller scope', async () => {
    horseAccess.lockVisibleHorse.mockRejectedValue(new NotFoundException());

    await expect(service.lockHorseForWrite(manager, vet, 'h1')).rejects.toThrow(
      NotFoundException,
    );
    expect(horseAccess.assertNotTransferred).not.toHaveBeenCalled();
  });
});

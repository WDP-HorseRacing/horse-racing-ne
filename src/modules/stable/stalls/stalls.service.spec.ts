import { BadRequestException } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { UserRole } from '../../../common/enums/role.enum';
import { UserStatus } from '../../../common/enums/user-status.enum';
import type { Actor } from '../../../common/types/actor';
import { HorseEntity } from '../../horses/entities/horse.entity';
import { StallStatus } from '../constants/stall-status.enum';
import { StallAssignmentEntity } from '../entities/stall-assignment.entity';
import { StallEntity } from '../entities/stall.entity';
import { StallsService } from './stalls.service';

describe('StallsService.assign', () => {
  const actor: Actor = { sub: 'kc-manager', roles: [UserRole.CLUB_MANAGER] };
  let stallRepository: { findOneBy: jest.Mock };
  let manager: {
    findOne: jest.Mock;
    existsBy: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
  };
  let service: StallsService;

  beforeEach(() => {
    stallRepository = {
      findOneBy: jest.fn().mockResolvedValue({
        id: 's1',
        barnId: 'b1',
        status: StallStatus.AVAILABLE,
      }),
    };
    manager = {
      findOne: jest.fn().mockResolvedValue({
        id: 'user-1',
        status: UserStatus.ACTIVE,
        role: UserRole.CLUB_MANAGER,
      }),
      existsBy: jest.fn().mockResolvedValue(true),
      create: jest.fn((_entity: unknown, row: object) => row),
      save: jest.fn((_entity: unknown, row: object) => Promise.resolve(row)),
    };
    const dataSource = {
      manager,
      transaction: jest.fn((work: (m: typeof manager) => Promise<unknown>) =>
        work(manager),
      ),
    };
    service = new StallsService(
      stallRepository as unknown as Repository<StallEntity>,
      {
        exists: jest.fn().mockResolvedValue(false),
      } as unknown as Repository<StallAssignmentEntity>,
      dataSource as unknown as DataSource,
    );
  });

  it.each([
    StallStatus.RESERVED,
    StallStatus.OCCUPIED,
    StallStatus.MAINTENANCE,
  ])('rejects a %s stall', async (status) => {
    stallRepository.findOneBy.mockResolvedValue({
      id: 's1',
      barnId: 'b1',
      status,
    });
    await expect(
      service.assign(actor, 's1', {
        horseId: 'h1',
        startAt: '2026-09-19T00:00:00Z',
      }),
    ).rejects.toThrow(BadRequestException);
    expect(manager.save).not.toHaveBeenCalled();
  });

  it('rejects a stall whose barn is not active', async () => {
    manager.existsBy.mockResolvedValue(false);
    await expect(
      service.assign(actor, 's1', {
        horseId: 'h1',
        startAt: '2026-09-19T00:00:00Z',
      }),
    ).rejects.toThrow(BadRequestException);
    expect(manager.save).not.toHaveBeenCalled();
  });

  it('rejects a reference horse', async () => {
    manager.findOne.mockImplementation((entity: unknown) =>
      Promise.resolve(
        entity === HorseEntity
          ? { id: 'h1', isReference: true }
          : {
              id: 'user-1',
              status: UserStatus.ACTIVE,
              role: UserRole.CLUB_MANAGER,
            },
      ),
    );
    await expect(
      service.assign(actor, 's1', {
        horseId: 'h1',
        startAt: '2026-09-19T00:00:00Z',
      }),
    ).rejects.toThrow(BadRequestException);
    expect(manager.save).not.toHaveBeenCalled();
  });

  it('assigns a horse to an available stall in an active barn', async () => {
    await service.assign(actor, 's1', {
      horseId: 'h1',
      startAt: '2026-09-19T00:00:00Z',
    });
    expect(manager.save).toHaveBeenCalledWith(
      StallAssignmentEntity,
      expect.objectContaining({ stallId: 's1', horseId: 'h1' }),
    );
  });
});

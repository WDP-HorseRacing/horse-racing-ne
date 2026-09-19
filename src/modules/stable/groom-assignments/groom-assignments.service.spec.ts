import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { UserRole } from '../../../common/enums/role.enum';
import { UserStatus } from '../../../common/enums/user-status.enum';
import type { Actor } from '../../../common/types/actor';
import { HorseLifecycleStatus } from '../../horses/constants/horse-status.enum';
import { HorseEntity } from '../../horses/entities/horse.entity';
import { UserEntity } from '../../users/entities/user.entity';
import { GroomAssignmentEntity } from '../entities/groom-assignment.entity';
import { assertTrainerBarn } from '../utils/trainer-barn';
import { GroomAssignmentsService } from './groom-assignments.service';

jest.mock('../utils/trainer-barn', () => ({ assertTrainerBarn: jest.fn() }));

const HORSE_ID = 'horse-1';
const actor: Actor = { sub: 'kc-cm', roles: [UserRole.CLUB_MANAGER] };
const caller = {
  id: 'cm-1',
  status: UserStatus.ACTIVE,
  role: UserRole.CLUB_MANAGER,
};
const groom = { id: 'groom-2', fullName: 'Groom B', email: 'b@x.vn' };

describe('GroomAssignmentsService', () => {
  let horse: Partial<HorseEntity> | null;
  let validGroom: typeof groom | null;
  let current: Partial<GroomAssignmentEntity> | null;
  let tx: {
    findOneBy: jest.Mock;
    update: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
  };
  let manager: { findOne: jest.Mock; findOneBy: jest.Mock; update: jest.Mock };
  let service: GroomAssignmentsService;

  beforeEach(() => {
    jest.mocked(assertTrainerBarn).mockReset().mockResolvedValue(undefined);
    horse = {
      id: HORSE_ID,
      isReference: false,
      lifecycleStatus: HorseLifecycleStatus.ACTIVE,
    };
    validGroom = groom;
    current = {
      id: 'ga-old',
      horseId: HORSE_ID,
      groomId: 'groom-1',
      endAt: null,
    };
    tx = {
      findOneBy: jest.fn(() => Promise.resolve(current)),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
      create: jest.fn((_entity: unknown, data: object) => data),
      save: jest.fn((data: object) =>
        Promise.resolve({ id: 'ga-new', ...data }),
      ),
    };
    manager = {
      findOne: jest.fn().mockResolvedValue(caller),
      findOneBy: jest.fn((entity: unknown) =>
        Promise.resolve(entity === HorseEntity ? horse : validGroom),
      ),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    const dataSource = {
      manager,
      transaction: jest.fn((work: (m: typeof tx) => Promise<unknown>) =>
        work(tx),
      ),
    };
    service = new GroomAssignmentsService(dataSource as unknown as DataSource);
  });

  describe('assign', () => {
    it('closes the current groom and opens a new one when the groom changes', async () => {
      const result = await service.assign(actor, HORSE_ID, {
        groomId: groom.id,
      });

      expect(tx.update).toHaveBeenCalledWith(
        GroomAssignmentEntity,
        { id: 'ga-old' },
        { endAt: expect.any(Date) as Date },
      );
      expect(tx.save).toHaveBeenCalledWith(
        expect.objectContaining({
          horseId: HORSE_ID,
          groomId: groom.id,
          endAt: null,
        }),
      );
      expect(result).toMatchObject({
        id: 'ga-new',
        groomId: groom.id,
        endAt: null,
      });
    });

    it('opens a groom assignment for a horse without a groom', async () => {
      current = null;
      await service.assign(actor, HORSE_ID, { groomId: groom.id });

      expect(tx.update).not.toHaveBeenCalled();
      expect(tx.save).toHaveBeenCalled();
    });

    it('changes nothing when the same groom is assigned again', async () => {
      current = { ...current, groomId: groom.id };
      const result = await service.assign(actor, HORSE_ID, {
        groomId: groom.id,
      });

      expect(tx.update).not.toHaveBeenCalled();
      expect(tx.save).not.toHaveBeenCalled();
      expect(result).toMatchObject({ id: 'ga-old', groomId: groom.id });
    });

    it('rejects a user who is not an active groom', async () => {
      validGroom = null;
      await expect(
        service.assign(actor, HORSE_ID, { groomId: 'someone' }),
      ).rejects.toThrow(BadRequestException);
      expect(manager.findOneBy).toHaveBeenCalledWith(UserEntity, {
        id: 'someone',
        role: UserRole.GROOM,
        status: UserStatus.ACTIVE,
      });
      expect(tx.save).not.toHaveBeenCalled();
    });

    it('rejects a reference horse', async () => {
      horse = { ...horse, isReference: true };
      await expect(
        service.assign(actor, HORSE_ID, { groomId: groom.id }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects a transferred horse', async () => {
      horse = { ...horse, lifecycleStatus: HorseLifecycleStatus.TRANSFERRED };
      await expect(
        service.assign(actor, HORSE_ID, { groomId: groom.id }),
      ).rejects.toThrow(ConflictException);
    });

    it('rejects a head trainer outside the horse barn', async () => {
      jest
        .mocked(assertTrainerBarn)
        .mockRejectedValue(
          new ForbiddenException('Ngựa không thuộc khu bạn phụ trách'),
        );
      await expect(
        service.assign(actor, HORSE_ID, { groomId: groom.id }),
      ).rejects.toThrow(ForbiddenException);
      expect(tx.save).not.toHaveBeenCalled();
    });

    it('returns 404 for a missing horse', async () => {
      horse = null;
      await expect(
        service.assign(actor, HORSE_ID, { groomId: groom.id }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('end', () => {
    it('closes the open groom assignment of the horse', async () => {
      await service.end(actor, HORSE_ID);
      expect(manager.update).toHaveBeenCalledWith(
        GroomAssignmentEntity,
        { horseId: HORSE_ID, endAt: expect.anything() as unknown },
        { endAt: expect.any(Date) as Date },
      );
    });

    it('returns 404 when the horse has no groom', async () => {
      manager.update.mockResolvedValue({ affected: 0 });
      await expect(service.end(actor, HORSE_ID)).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});

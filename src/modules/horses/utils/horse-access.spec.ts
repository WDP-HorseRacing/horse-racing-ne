import { NotFoundException } from '@nestjs/common';
import { EntityManager, IsNull } from 'typeorm';
import { UserRole } from '../../../common/enums/role.enum';
import type { Actor } from '../../../common/types/actor';
import { HorseOwnershipEntity } from '../entities/horse-ownership.entity';
import { HorseEntity } from '../entities/horse.entity';
import { findReadableHorse } from './horse-access';

function actorWith(role: UserRole): Actor {
  return { sub: `kc-${role}`, roles: [role] };
}

describe('findReadableHorse', () => {
  let stored: Partial<HorseEntity> | null;
  let owns: boolean;
  let manager: { findOne: jest.Mock; existsBy: jest.Mock };

  beforeEach(() => {
    stored = { id: 'h1', isReference: false, deletedAt: null };
    owns = true;
    manager = {
      findOne: jest.fn((_entity: unknown, options: { withDeleted?: boolean }) =>
        Promise.resolve(
          stored?.deletedAt && !options.withDeleted ? null : stored,
        ),
      ),
      existsBy: jest.fn(() => Promise.resolve(owns)),
    };
  });

  const read = (role: UserRole) =>
    findReadableHorse(
      manager as unknown as EntityManager,
      actorWith(role),
      'user-1',
      'h1',
    );

  it.each([UserRole.HEAD_TRAINER, UserRole.VETERINARIAN, UserRole.GROOM])(
    'lets %s read any horse of the club',
    async (role) => {
      await expect(read(role)).resolves.toMatchObject({ id: 'h1' });
      expect(manager.existsBy).not.toHaveBeenCalled();
    },
  );

  it('lets a horse owner read a horse they currently own', async () => {
    await expect(read(UserRole.HORSE_OWNER)).resolves.toMatchObject({
      id: 'h1',
    });
    expect(manager.existsBy).toHaveBeenCalledWith(HorseOwnershipEntity, {
      horseId: 'h1',
      ownerId: 'user-1',
      endAt: IsNull(),
    });
  });

  it('answers not found when a horse owner reads a horse they do not own', async () => {
    owns = false;
    await expect(read(UserRole.HORSE_OWNER)).rejects.toThrow(NotFoundException);
  });

  it('lets a club manager read a deleted profile', async () => {
    stored = { id: 'h1', isReference: false, deletedAt: new Date() };
    await expect(read(UserRole.CLUB_MANAGER)).resolves.toMatchObject({
      id: 'h1',
    });
    expect(manager.findOne).toHaveBeenCalledWith(HorseEntity, {
      where: { id: 'h1' },
      withDeleted: true,
    });
  });

  it.each([
    UserRole.HEAD_TRAINER,
    UserRole.VETERINARIAN,
    UserRole.GROOM,
    UserRole.HORSE_OWNER,
  ])('answers not found when %s reads a deleted profile', async (role) => {
    stored = { id: 'h1', isReference: false, deletedAt: new Date() };
    await expect(read(role)).rejects.toThrow(NotFoundException);
  });

  it('lets a club manager read a reference horse', async () => {
    stored = { id: 'h1', isReference: true, deletedAt: null };
    await expect(read(UserRole.CLUB_MANAGER)).resolves.toMatchObject({
      isReference: true,
    });
  });

  it.each([
    UserRole.HEAD_TRAINER,
    UserRole.VETERINARIAN,
    UserRole.GROOM,
    UserRole.HORSE_OWNER,
  ])('answers not found when %s reads a reference horse', async (role) => {
    stored = { id: 'h1', isReference: true, deletedAt: null };
    await expect(read(role)).rejects.toThrow(NotFoundException);
  });

  it('answers not found for a horse that does not exist', async () => {
    stored = null;
    await expect(read(UserRole.CLUB_MANAGER)).rejects.toThrow(
      NotFoundException,
    );
  });
});

import { BadRequestException, ConflictException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { UserRole } from '../../../common/enums/role.enum';
import { UserStatus } from '../../../common/enums/user-status.enum';
import type { Actor } from '../../../common/types/actor';
import { HorseOwnershipEntity } from '../entities/horse-ownership.entity';
import { HorseEntity } from '../entities/horse.entity';
import { HorseAccessService } from '../shared/horse-access.service';
import { HorseOwnersService } from '../shared/horse-owners.service';
import { HorsesSharedRepository } from '../shared/horses-shared.repository';
import { findReadableHorse } from '../utils/horse-access';
import { HorseOwnershipsRepository } from './horse-ownerships.repository';
import { HorseOwnershipsService } from './horse-ownerships.service';

jest.mock('../utils/horse-access');
const findReadableHorseMock = jest.mocked(findReadableHorse);

function actorWith(role: UserRole): Actor {
  return { sub: `kc-${role}`, roles: [role] };
}

describe('HorseOwnershipsService.listOwners', () => {
  const ownership = (ownerId: string, email: string) => ({
    id: `ow-${ownerId}`,
    horseId: 'h1',
    ownerId,
    owner: { fullName: ownerId, email },
    percentage: '50.00',
    startAt: new Date('2026-01-01T00:00:00+07:00'),
    endAt: null,
    isRepresentative: false,
  });
  let service: HorseOwnershipsService;

  beforeEach(() => {
    const repository = {
      listOwnershipByHorse: jest
        .fn()
        .mockResolvedValue([
          ownership('user-1', 'me@club.vn'),
          ownership('owner-2', 'other@club.vn'),
        ]),
    };
    findReadableHorseMock.mockReset();
    findReadableHorseMock.mockResolvedValue(
      Object.assign(new HorseEntity(), { id: 'h1' }),
    );
    const dataSource = {
      manager: {
        findOne: jest.fn().mockResolvedValue({
          id: 'user-1',
          status: UserStatus.ACTIVE,
          role: UserRole.CLUB_MANAGER,
        }),
      },
    } as unknown as DataSource;
    service = new HorseOwnershipsService(
      repository as unknown as HorseOwnershipsRepository,
      new HorseAccessService(dataSource, {} as HorsesSharedRepository),
      new HorseOwnersService(dataSource),
      dataSource,
    );
  });

  it('shows every owner email to a club manager', async () => {
    const rows = await service.listOwners(
      actorWith(UserRole.CLUB_MANAGER),
      'h1',
    );
    expect(rows.map((row) => row.ownerEmail)).toEqual([
      'me@club.vn',
      'other@club.vn',
    ]);
  });

  it('shows a horse owner only their own email', async () => {
    const [mine, other] = await service.listOwners(
      actorWith(UserRole.HORSE_OWNER),
      'h1',
    );
    expect(mine.ownerEmail).toBe('me@club.vn');
    expect(other).not.toHaveProperty('ownerEmail');
    expect(other).toMatchObject({
      ownerName: 'owner-2',
      percentage: '50.00',
    });
  });
});

describe('HorseOwnershipsService.replaceOwners', () => {
  const openRow = (id: string, ownerId: string, percentage: string) =>
    Object.assign(new HorseOwnershipEntity(), {
      id,
      horseId: 'h1',
      ownerId,
      percentage,
      isRepresentative: false,
      startAt: new Date('2026-01-01T00:00:00+07:00'),
      endAt: null,
    });
  let repository: {
    listOwnershipByHorse: jest.Mock;
    lockOpenOwnerships: jest.Mock;
    closeOwnerships: jest.Mock;
  };
  let owners: { validateOwners: jest.Mock; insertOwnerships: jest.Mock };
  let manager: { getRepository: jest.Mock };
  let service: HorseOwnershipsService;

  beforeEach(() => {
    jest.useFakeTimers({ now: new Date('2026-09-20T10:00:00+07:00') });
    repository = {
      listOwnershipByHorse: jest.fn().mockResolvedValue([]),
      lockOpenOwnerships: jest
        .fn()
        .mockResolvedValue([
          openRow('row-a', 'a', '60.00'),
          openRow('row-b', 'b', '40.00'),
        ]),
      closeOwnerships: jest.fn().mockResolvedValue(undefined),
    };
    owners = {
      validateOwners: jest.fn().mockResolvedValue(undefined),
      insertOwnerships: jest.fn().mockResolvedValue(undefined),
    };
    manager = {
      getRepository: jest
        .fn()
        .mockReturnValue({ findOne: jest.fn().mockResolvedValue({}) }),
    };
    const access = {
      currentUser: jest.fn().mockResolvedValue({ id: 'cm-1' }),
      findHorse: jest.fn().mockResolvedValue(new HorseEntity()),
      findReadable: jest.fn().mockResolvedValue(new HorseEntity()),
      assertOperational: jest.fn(),
      assertNotTransferred: jest.fn(),
      hasRole: jest.fn().mockReturnValue(true),
    };
    const dataSource = {
      transaction: jest.fn((work: (m: unknown) => Promise<unknown>) =>
        work(manager),
      ),
    } as unknown as DataSource;
    service = new HorseOwnershipsService(
      repository as unknown as HorseOwnershipsRepository,
      access as unknown as HorseAccessService,
      owners as unknown as HorseOwnersService,
      dataSource,
    );
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('closes only the changed row and keeps the unchanged owner', async () => {
    const transferredAt = '2026-09-10T14:30:00+07:00';
    await service.replaceOwners(actorWith(UserRole.CLUB_MANAGER), 'h1', {
      transferredAt,
      owners: [
        { ownerId: 'a', percentage: 40 },
        { ownerId: 'b', percentage: 40 },
        { ownerId: 'c', percentage: 20 },
      ],
    });
    expect(repository.closeOwnerships).toHaveBeenCalledWith(
      manager,
      ['row-a'],
      new Date(transferredAt),
    );
    expect(owners.insertOwnerships).toHaveBeenCalledWith(
      manager,
      'h1',
      [
        { ownerId: 'a', percentage: 40 },
        { ownerId: 'c', percentage: 20 },
      ],
      new Date(transferredAt),
    );
  });

  it('closes the old rows before inserting the new ones', async () => {
    await service.replaceOwners(actorWith(UserRole.CLUB_MANAGER), 'h1', {
      owners: [{ ownerId: 'c', percentage: 100, isRepresentative: true }],
    });
    expect(repository.closeOwnerships.mock.invocationCallOrder[0]).toBeLessThan(
      owners.insertOwnerships.mock.invocationCallOrder[0],
    );
  });

  it('uses the current moment when no transfer time is given', async () => {
    await service.replaceOwners(actorWith(UserRole.CLUB_MANAGER), 'h1', {
      owners: [{ ownerId: 'c', percentage: 100 }],
    });
    expect(repository.closeOwnerships).toHaveBeenCalledWith(
      manager,
      ['row-a', 'row-b'],
      new Date('2026-09-20T10:00:00+07:00'),
    );
  });

  it('writes nothing when the owners do not change', async () => {
    await service.replaceOwners(actorWith(UserRole.CLUB_MANAGER), 'h1', {
      owners: [
        { ownerId: 'a', percentage: 60 },
        { ownerId: 'b', percentage: 40 },
      ],
    });
    expect(repository.closeOwnerships).toHaveBeenCalledWith(
      manager,
      [],
      expect.any(Date),
    );
    expect(owners.insertOwnerships).not.toHaveBeenCalled();
  });

  it('rejects a transfer in the future', async () => {
    await expect(
      service.replaceOwners(actorWith(UserRole.CLUB_MANAGER), 'h1', {
        transferredAt: '2026-09-21T00:00:00+07:00',
        owners: [{ ownerId: 'c', percentage: 100 }],
      }),
    ).rejects.toThrow(BadRequestException);
    expect(repository.closeOwnerships).not.toHaveBeenCalled();
  });

  it('rejects a transfer not after the latest open ownership start', async () => {
    await expect(
      service.replaceOwners(actorWith(UserRole.CLUB_MANAGER), 'h1', {
        transferredAt: '2026-01-01T00:00:00+07:00',
        owners: [{ ownerId: 'c', percentage: 100 }],
      }),
    ).rejects.toThrow(ConflictException);
    expect(repository.closeOwnerships).not.toHaveBeenCalled();
    expect(owners.insertOwnerships).not.toHaveBeenCalled();
  });
});

describe('HorseOwnershipsService.listOwners scope', () => {
  const row = (
    id: string,
    ownerId: string,
    endAt: Date | null,
    isRepresentative = false,
  ) =>
    Object.assign(new HorseOwnershipEntity(), {
      id,
      horseId: 'h1',
      ownerId,
      owner: { fullName: `name-${ownerId}`, email: `${ownerId}@club.vn` },
      percentage: '40.00',
      startAt: new Date('2026-01-01T00:00:00+07:00'),
      endAt,
      isRepresentative,
    });
  const closedAt = new Date('2026-09-10T14:30:00+07:00');
  let hasRole: jest.Mock;
  let service: HorseOwnershipsService;

  beforeEach(() => {
    const repository = {
      listOwnershipByHorse: jest
        .fn()
        .mockResolvedValue([
          row('mine-open', 'me', null),
          row('co-open', 'co', null, true),
          row('mine-closed', 'me', closedAt),
          row('former', 'former', closedAt),
        ]),
    };
    hasRole = jest.fn();
    const access = {
      currentUser: jest.fn().mockResolvedValue({ id: 'me' }),
      findReadable: jest.fn().mockResolvedValue(new HorseEntity()),
      hasRole,
    };
    service = new HorseOwnershipsService(
      repository as unknown as HorseOwnershipsRepository,
      access as unknown as HorseAccessService,
      {} as HorseOwnersService,
      {} as DataSource,
    );
  });

  it('shows a club manager the full history', async () => {
    hasRole.mockReturnValue(true);
    const rows = await service.listOwners(
      actorWith(UserRole.CLUB_MANAGER),
      'h1',
    );
    expect(rows.map((r) => r.id)).toEqual([
      'mine-open',
      'co-open',
      'mine-closed',
      'former',
    ]);
    expect(rows[3]).toHaveProperty('ownerEmail', 'former@club.vn');
  });

  it('shows a horse owner their own rows in full, including closed ones', async () => {
    hasRole.mockReturnValue(false);
    const rows = await service.listOwners(
      actorWith(UserRole.HORSE_OWNER),
      'h1',
    );
    expect(rows.filter((r) => r.ownerId === 'me').map((r) => r.id)).toEqual([
      'mine-open',
      'mine-closed',
    ]);
  });

  it('shows a horse owner only name, share and representative flag of a current co-owner', async () => {
    hasRole.mockReturnValue(false);
    const rows = await service.listOwners(
      actorWith(UserRole.HORSE_OWNER),
      'h1',
    );
    expect(rows[1]).toEqual({
      ownerName: 'name-co',
      percentage: '40.00',
      isRepresentative: true,
    });
  });

  it('hides former owners from a horse owner', async () => {
    hasRole.mockReturnValue(false);
    const rows = await service.listOwners(
      actorWith(UserRole.HORSE_OWNER),
      'h1',
    );
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.ownerName)).not.toContain('name-former');
  });
});

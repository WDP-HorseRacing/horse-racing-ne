import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, QueryFailedError } from 'typeorm';
import { UserRole } from '../../../common/enums/role.enum';
import { UserStatus } from '../../../common/enums/user-status.enum';
import type { Actor } from '../../../common/types/actor';
import { AuditAction } from '../../audit/constants/audit-action.enum';
import { AuditEntityType } from '../../audit/constants/audit-entity-type.enum';
import { StallStatus } from '../../stable/constants/stall-status.enum';
import { STALE_HORSE_MESSAGE } from '../enums/horse.constants';
import { RaceAptitude } from '../enums/race-aptitude.enum';
import { HorseGender } from '../enums/horse-gender.enum';
import { HorseMeasurementType } from '../enums/horse-measurement-type.enum';
import {
  HorseHealthStatus,
  HorseLifecycleStatus,
} from '../enums/horse-status.enum';
import { CreateHorseDto, HorseListQueryDto } from '../dto/horse.dto';
import { HorseEntity } from '../entities/horse.entity';
import { HorseProfilesRepository } from './horse-profiles.repository';
import { HorseAccessService } from '../shared/horse-access.service';
import { HorseOwnersService } from '../shared/horse-owners.service';
import { HorsesSharedRepository } from '../shared/horses-shared.repository';
import { findReadableHorse } from '../utils/horse-access';
import { HorseProfilesService } from './horse-profiles.service';

jest.mock('../utils/horse-access');
const findReadableHorseMock = jest.mocked(findReadableHorse);

/**
 * Dựng HorseProfilesService với các service dùng chung thật, cùng chung một mock repository và DataSource.
 *
 * @param repository Mock các query của repository, dùng cho cả repository riêng và repository dùng chung
 * @param dataSource Mock DataSource
 * @param audit Mock AuditService
 * @returns HorseProfilesService dùng trong test
 */
function buildService(
  repository: object,
  dataSource: object,
  audit: { record: jest.Mock },
): HorseProfilesService {
  const source = dataSource as DataSource;
  const shared = repository as HorsesSharedRepository;
  return new HorseProfilesService(
    repository as HorseProfilesRepository,
    shared,
    new HorseAccessService(source, shared),
    new HorseOwnersService(source),
    source,
    audit,
  );
}

function actorWith(role: UserRole): Actor {
  return { sub: `kc-${role}`, roles: [role] };
}

function queryWith(patch: Partial<HorseListQueryDto>): HorseListQueryDto {
  return Object.assign(new HorseListQueryDto(), patch);
}

describe('HorseProfilesService.list', () => {
  let repository: {
    list: jest.Mock;
    currentStallsByHorseIds: jest.Mock;
    activeTrainingLockHorseIds: jest.Mock;
  };
  let service: HorseProfilesService;

  beforeEach(() => {
    repository = {
      list: jest.fn().mockResolvedValue([[], 0]),
      currentStallsByHorseIds: jest.fn().mockResolvedValue([]),
      activeTrainingLockHorseIds: jest.fn().mockResolvedValue(new Set()),
    };
    const dataSource = {
      manager: {
        findOne: jest.fn().mockResolvedValue({
          id: 'user-1',
          status: UserStatus.ACTIVE,
          role: UserRole.CLUB_MANAGER,
        }),
      },
    };
    service = buildService(repository, dataSource, { record: jest.fn() });
  });

  it('lets a club manager filter reference horses', async () => {
    await service.list(
      actorWith(UserRole.CLUB_MANAGER),
      queryWith({ reference: true }),
    );
    expect(repository.list).toHaveBeenCalled();
  });

  it('forbids a head trainer from filtering reference horses', async () => {
    await expect(
      service.list(
        actorWith(UserRole.HEAD_TRAINER),
        queryWith({ reference: true }),
      ),
    ).rejects.toThrow(ForbiddenException);
    expect(repository.list).not.toHaveBeenCalled();
  });

  it('lets a club manager filter deleted profiles', async () => {
    await service.list(
      actorWith(UserRole.CLUB_MANAGER),
      queryWith({ deleted: true }),
    );
    expect(repository.list).toHaveBeenCalled();
  });

  it.each([
    UserRole.HEAD_TRAINER,
    UserRole.VETERINARIAN,
    UserRole.GROOM,
    UserRole.HORSE_OWNER,
  ])('forbids %s from filtering deleted profiles', async (role) => {
    await expect(
      service.list(actorWith(role), queryWith({ deleted: true })),
    ).rejects.toThrow(ForbiddenException);
    expect(repository.list).not.toHaveBeenCalled();
  });

  it('lets a groom list the whole club', async () => {
    await service.list(actorWith(UserRole.GROOM), queryWith({}));
    expect(repository.list).toHaveBeenCalledWith(
      { kind: 'ALL' },
      expect.any(HorseListQueryDto),
    );
  });

  it('limits a horse owner to the horses they own', async () => {
    await service.list(actorWith(UserRole.HORSE_OWNER), queryWith({}));
    expect(repository.list).toHaveBeenCalledWith(
      { kind: 'OWNER', userId: 'user-1' },
      expect.any(HorseListQueryDto),
    );
  });

  it('adds the current stall and race registration flag to each horse', async () => {
    const horse = (id: string) =>
      Object.assign(new HorseEntity(), {
        id,
        name: id,
        isReference: false,
        healthStatus: HorseHealthStatus.ELIGIBLE,
        lifecycleStatus: HorseLifecycleStatus.ACTIVE,
      });
    repository.list.mockResolvedValue([[horse('h1'), horse('h2')], 2]);
    repository.currentStallsByHorseIds.mockResolvedValue([
      {
        horseId: 'h1',
        stallId: 's1',
        stallCode: 'A-01',
        barnId: 'b1',
        barnName: 'Barn A',
      },
    ]);
    repository.activeTrainingLockHorseIds.mockResolvedValue(new Set(['h2']));

    const result = await service.list(
      actorWith(UserRole.CLUB_MANAGER),
      queryWith({}),
    );

    expect(repository.currentStallsByHorseIds).toHaveBeenCalledWith([
      'h1',
      'h2',
    ]);
    expect(repository.activeTrainingLockHorseIds).toHaveBeenCalledWith([
      'h1',
      'h2',
    ]);
    expect(result.items).toMatchObject([
      {
        id: 'h1',
        stall: { id: 's1', code: 'A-01', barn: { id: 'b1', name: 'Barn A' } },
        canRegisterRace: true,
      },
      { id: 'h2', stall: null, canRegisterRace: false },
    ]);
  });
});

describe('HorseProfilesService.create', () => {
  const stall = { id: 's1', barnId: 'b1', status: StallStatus.AVAILABLE };
  let repository: {
    findById: jest.Mock;
    microchipTaken: jest.Mock;
    lockStall: jest.Mock;
    barnIsActive: jest.Mock;
    stallHasActiveAssignment: jest.Mock;
    assignStall: jest.Mock;
    lockPedigree: jest.Mock;
  };
  let manager: { save: jest.Mock; getRepository: jest.Mock };
  let ownershipRepo: { create: jest.Mock; save: jest.Mock };
  let userFind: jest.Mock;
  let service: HorseProfilesService;

  const body = (patch: Partial<CreateHorseDto> = {}): CreateHorseDto =>
    Object.assign(new CreateHorseDto(), {
      name: ' Thần Gió ',
      gender: HorseGender.MALE,
      ...patch,
    });

  beforeEach(() => {
    repository = {
      findById: jest.fn(),
      microchipTaken: jest.fn().mockResolvedValue(false),
      lockStall: jest.fn().mockResolvedValue(stall),
      barnIsActive: jest.fn().mockResolvedValue(true),
      stallHasActiveAssignment: jest.fn().mockResolvedValue(false),
      assignStall: jest.fn(),
      lockPedigree: jest.fn(),
    };
    ownershipRepo = {
      create: jest.fn((row: unknown) => row),
      save: jest.fn(),
    };
    manager = {
      save: jest.fn((_entity: unknown, row: object) =>
        Promise.resolve(
          Object.assign(new HorseEntity(), row, {
            id: 'h-new',
            healthStatus: HorseHealthStatus.ELIGIBLE,
            lifecycleStatus: HorseLifecycleStatus.ACTIVE,
          }),
        ),
      ),
      getRepository: jest.fn(() => ownershipRepo),
    };
    userFind = jest.fn().mockResolvedValue([{ id: 'o1' }, { id: 'o2' }]);
    const dataSource = {
      manager: {
        findOne: jest.fn().mockResolvedValue({
          id: 'user-1',
          status: UserStatus.ACTIVE,
          role: UserRole.CLUB_MANAGER,
        }),
      },
      getRepository: jest.fn(() => ({ find: userFind })),
      transaction: jest.fn((work: (m: typeof manager) => Promise<unknown>) =>
        work(manager),
      ),
    };
    service = buildService(repository, dataSource, { record: jest.fn() });
  });

  const owners = [
    { ownerId: 'o1', percentage: 60 },
    { ownerId: 'o2', percentage: 40 },
  ];

  it('locks the pedigree and reads the parents inside the transaction', async () => {
    repository.findById.mockResolvedValue(
      Object.assign(new HorseEntity(), {
        id: 'sire-1',
        gender: HorseGender.MALE,
        dateOfBirth: null,
      }),
    );
    await service.create(
      actorWith(UserRole.CLUB_MANAGER),
      body({ sireId: 'sire-1' }),
    );
    expect(repository.lockPedigree).toHaveBeenCalledWith(manager);
    expect(repository.findById).toHaveBeenCalledWith('sire-1', manager);
    expect(repository.lockPedigree.mock.invocationCallOrder[0]).toBeLessThan(
      repository.findById.mock.invocationCallOrder[0],
    );
  });

  it('does not lock the pedigree for a horse without parents', async () => {
    await service.create(actorWith(UserRole.CLUB_MANAGER), body());
    expect(repository.lockPedigree).not.toHaveBeenCalled();
  });

  it('creates the horse, places it in the stall and assigns its owners together', async () => {
    const result = await service.create(
      actorWith(UserRole.CLUB_MANAGER),
      body({ stallId: 's1', owners }),
    );
    expect(result).toMatchObject({
      id: 'h-new',
      name: 'Thần Gió',
      healthStatus: HorseHealthStatus.ELIGIBLE,
      lifecycleStatus: HorseLifecycleStatus.ACTIVE,
    });
    expect(repository.assignStall).toHaveBeenCalledWith(
      manager,
      stall,
      'h-new',
      expect.any(Date),
    );
    expect(ownershipRepo.save).toHaveBeenCalledWith([
      expect.objectContaining({ horseId: 'h-new', ownerId: 'o1' }),
      expect.objectContaining({ horseId: 'h-new', ownerId: 'o2' }),
    ]);
  });

  it('saves the representative flag and defaults it to false', async () => {
    await service.create(
      actorWith(UserRole.CLUB_MANAGER),
      body({
        owners: [
          { ownerId: 'o1', percentage: 60, isRepresentative: true },
          { ownerId: 'o2', percentage: 40 },
        ],
      }),
    );
    expect(ownershipRepo.save).toHaveBeenCalledWith([
      expect.objectContaining({ ownerId: 'o1', isRepresentative: true }),
      expect.objectContaining({ ownerId: 'o2', isRepresentative: false }),
    ]);
  });

  it('creates a horse with only the required fields', async () => {
    await service.create(actorWith(UserRole.CLUB_MANAGER), body());
    expect(repository.lockStall).not.toHaveBeenCalled();
    expect(ownershipRepo.save).not.toHaveBeenCalled();
  });

  it('rejects a date of birth in the future', async () => {
    await expect(
      service.create(
        actorWith(UserRole.CLUB_MANAGER),
        body({ dateOfBirth: '2999-01-01' }),
      ),
    ).rejects.toThrow(BadRequestException);
    expect(manager.save).not.toHaveBeenCalled();
  });

  describe('at 03:00 in Vietnam, still the previous day in UTC', () => {
    beforeEach(() => {
      jest.useFakeTimers({ now: new Date('2026-09-18T20:00:00Z') });
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('accepts a date of birth on today in Vietnam', async () => {
      await expect(
        service.create(
          actorWith(UserRole.CLUB_MANAGER),
          body({ dateOfBirth: '2026-09-19' }),
        ),
      ).resolves.toMatchObject({ id: 'h-new' });
    });

    it('starts the ownerships at the current moment', async () => {
      await service.create(actorWith(UserRole.CLUB_MANAGER), body({ owners }));
      expect(ownershipRepo.save).toHaveBeenCalledWith([
        expect.objectContaining({
          ownerId: 'o1',
          startAt: new Date('2026-09-18T20:00:00Z'),
        }),
        expect.objectContaining({
          ownerId: 'o2',
          startAt: new Date('2026-09-18T20:00:00Z'),
        }),
      ]);
    });
  });

  it('rejects a microchip used by another horse, including deleted ones', async () => {
    repository.microchipTaken.mockResolvedValue(true);
    await expect(
      service.create(
        actorWith(UserRole.CLUB_MANAGER),
        body({ microchipId: ' 985000000000001 ' }),
      ),
    ).rejects.toThrow(ConflictException);
    expect(repository.microchipTaken).toHaveBeenCalledWith(
      '985000000000001',
      undefined,
    );
    expect(manager.save).not.toHaveBeenCalled();
  });

  it.each([
    StallStatus.RESERVED,
    StallStatus.MAINTENANCE,
    StallStatus.OCCUPIED,
  ])('rejects a %s stall', async (status) => {
    repository.lockStall.mockResolvedValue({ ...stall, status });
    await expect(
      service.create(actorWith(UserRole.CLUB_MANAGER), body({ stallId: 's1' })),
    ).rejects.toThrow(ConflictException);
    expect(manager.save).not.toHaveBeenCalled();
  });

  it('rejects a stall whose barn is not active', async () => {
    repository.barnIsActive.mockResolvedValue(false);
    await expect(
      service.create(actorWith(UserRole.CLUB_MANAGER), body({ stallId: 's1' })),
    ).rejects.toThrow(ConflictException);
    expect(repository.barnIsActive).toHaveBeenCalledWith(manager, 'b1');
    expect(manager.save).not.toHaveBeenCalled();
  });

  it('rejects a stall that already has a horse', async () => {
    repository.stallHasActiveAssignment.mockResolvedValue(true);
    await expect(
      service.create(actorWith(UserRole.CLUB_MANAGER), body({ stallId: 's1' })),
    ).rejects.toThrow(ConflictException);
    expect(manager.save).not.toHaveBeenCalled();
  });

  it('rejects a stall that does not exist', async () => {
    repository.lockStall.mockResolvedValue(null);
    await expect(
      service.create(actorWith(UserRole.CLUB_MANAGER), body({ stallId: 's1' })),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects owner shares that do not sum to 100', async () => {
    await expect(
      service.create(
        actorWith(UserRole.CLUB_MANAGER),
        body({
          owners: [
            { ownerId: 'o1', percentage: 60 },
            { ownerId: 'o2', percentage: 30 },
          ],
        }),
      ),
    ).rejects.toThrow(BadRequestException);
    expect(manager.save).not.toHaveBeenCalled();
  });

  it('rejects an owner that is not an active horse owner', async () => {
    userFind.mockResolvedValue([{ id: 'o1' }]);
    await expect(
      service.create(actorWith(UserRole.CLUB_MANAGER), body({ owners })),
    ).rejects.toThrow(BadRequestException);
    expect(manager.save).not.toHaveBeenCalled();
  });

  it('rejects a reference horse with a stall or owners', async () => {
    await expect(
      service.create(
        actorWith(UserRole.CLUB_MANAGER),
        body({ isReference: true, stallId: 's1' }),
      ),
    ).rejects.toThrow(BadRequestException);
    expect(manager.save).not.toHaveBeenCalled();
  });

  it('fails as a whole when saving the owners fails', async () => {
    ownershipRepo.save.mockRejectedValue(new Error('db down'));
    await expect(
      service.create(
        actorWith(UserRole.CLUB_MANAGER),
        body({ stallId: 's1', owners }),
      ),
    ).rejects.toThrow('db down');
  });

  it('maps a concurrent stall assignment to a conflict', async () => {
    const driverError = Object.assign(new Error('dup'), {
      code: '23505',
      constraint: 'stall_assignments_active_stall_uq',
    });
    repository.assignStall.mockRejectedValue(
      new QueryFailedError('INSERT', [], driverError),
    );
    await expect(
      service.create(actorWith(UserRole.CLUB_MANAGER), body({ stallId: 's1' })),
    ).rejects.toThrow('Ô chuồng đang có ngựa ở');
  });
});

describe('HorseProfilesService.update', () => {
  const horse = Object.assign(new HorseEntity(), {
    id: 'h1',
    name: 'Gió Bắc',
    isReference: false,
    gender: HorseGender.MALE,
    raceAptitude: null,
    microchipId: null,
    dateOfBirth: null,
    sireId: null,
    damId: null,
    lifecycleStatus: HorseLifecycleStatus.ACTIVE,
    version: 3,
  });
  let repository: {
    findById: jest.Mock;
    microchipTaken: jest.Mock;
    earliestChildBirthDate: jest.Mock;
    lockPedigree: jest.Mock;
    parentUsage: jest.Mock;
  };
  let update: jest.Mock;
  let trainerBarnQuery: jest.Mock;
  let record: jest.Mock;
  let manager: Record<string, jest.Mock>;
  let service: HorseProfilesService;

  beforeEach(() => {
    repository = {
      findById: jest.fn().mockResolvedValue(horse),
      microchipTaken: jest.fn().mockResolvedValue(false),
      earliestChildBirthDate: jest.fn().mockResolvedValue(null),
      lockPedigree: jest.fn(),
      parentUsage: jest.fn().mockResolvedValue({ asSire: false, asDam: false }),
    };
    update = jest.fn().mockResolvedValue({ affected: 1 });
    trainerBarnQuery = jest.fn().mockResolvedValue([{}]);
    record = jest.fn();
    manager = {
      findOne: jest.fn().mockResolvedValue({
        id: 'user-1',
        status: UserStatus.ACTIVE,
        role: UserRole.CLUB_MANAGER,
      }),
      getRepository: jest.fn(() => ({ update })),
      query: trainerBarnQuery,
    };
    const dataSource = {
      manager,
      transaction: jest.fn(
        (work: (transactionManager: unknown) => Promise<unknown>) =>
          work(manager),
      ),
    };
    service = buildService(repository, dataSource, { record });
  });

  it('rejects a date of birth in the future', async () => {
    await expect(
      service.update(actorWith(UserRole.CLUB_MANAGER), 'h1', {
        version: 3,
        dateOfBirth: '2999-01-01',
      }),
    ).rejects.toThrow(BadRequestException);
    expect(update).not.toHaveBeenCalled();
  });

  it('rejects a microchip used by another horse and ignores the horse itself', async () => {
    repository.microchipTaken.mockResolvedValue(true);
    await expect(
      service.update(actorWith(UserRole.CLUB_MANAGER), 'h1', {
        version: 3,
        microchipId: '985000000000001',
      }),
    ).rejects.toThrow(ConflictException);
    expect(repository.microchipTaken).toHaveBeenCalledWith(
      '985000000000001',
      'h1',
    );
    expect(update).not.toHaveBeenCalled();
  });

  it('rejects a date of birth on or after the earliest child of the horse', async () => {
    repository.earliestChildBirthDate.mockResolvedValue('2020-05-01');
    await expect(
      service.update(actorWith(UserRole.CLUB_MANAGER), 'h1', {
        version: 3,
        dateOfBirth: '2021-01-01',
      }),
    ).rejects.toThrow('Cha/mẹ phải sinh trước ngựa con');
    expect(repository.earliestChildBirthDate).toHaveBeenCalledWith(
      'h1',
      manager,
    );
    expect(update).not.toHaveBeenCalled();
  });

  it('locks the pedigree before checking a gender change against the children', async () => {
    repository.parentUsage.mockResolvedValue({ asSire: true, asDam: false });
    await expect(
      service.update(actorWith(UserRole.CLUB_MANAGER), 'h1', {
        version: 3,
        gender: HorseGender.FEMALE,
      }),
    ).rejects.toThrow(ConflictException);
    expect(repository.lockPedigree).toHaveBeenCalledWith(manager);
    expect(repository.parentUsage).toHaveBeenCalledWith('h1', manager);
    expect(repository.lockPedigree.mock.invocationCallOrder[0]).toBeLessThan(
      repository.parentUsage.mock.invocationCallOrder[0],
    );
    expect(update).not.toHaveBeenCalled();
  });

  it('does not lock the pedigree when no pedigree field changes', async () => {
    await service.update(actorWith(UserRole.CLUB_MANAGER), 'h1', {
      version: 3,
      name: 'Gió Nam',
      gender: HorseGender.MALE,
    });
    expect(repository.lockPedigree).not.toHaveBeenCalled();
    expect(repository.parentUsage).not.toHaveBeenCalled();
  });

  it('rejects a stale version before writing', async () => {
    await expect(
      service.update(actorWith(UserRole.CLUB_MANAGER), 'h1', {
        version: 2,
        name: 'Gió Nam',
      }),
    ).rejects.toThrow(STALE_HORSE_MESSAGE);
    expect(update).not.toHaveBeenCalled();
  });

  it('writes only the changed fields guarded by the version', async () => {
    await service.update(actorWith(UserRole.CLUB_MANAGER), 'h1', {
      version: 3,
      name: '  Gió Nam  ',
      gender: HorseGender.MALE,
    });
    expect(update).toHaveBeenCalledWith(
      { id: 'h1', version: 3 },
      { name: 'Gió Nam' },
    );
  });

  it('rejects when another save bumped the version in between', async () => {
    update.mockResolvedValue({ affected: 0 });
    await expect(
      service.update(actorWith(UserRole.CLUB_MANAGER), 'h1', {
        version: 3,
        name: 'Gió Nam',
      }),
    ).rejects.toThrow(STALE_HORSE_MESSAGE);
  });

  it('rejects a head trainer on a horse outside their barn', async () => {
    trainerBarnQuery.mockResolvedValue([]);
    await expect(
      service.update(actorWith(UserRole.HEAD_TRAINER), 'h1', {
        version: 3,
        raceAptitude: RaceAptitude.SPRINTER,
      }),
    ).rejects.toThrow(ForbiddenException);
    expect(update).not.toHaveBeenCalled();
  });

  it('rejects a head trainer sending fields beyond the race aptitude', async () => {
    await expect(
      service.update(actorWith(UserRole.HEAD_TRAINER), 'h1', {
        version: 3,
        raceAptitude: RaceAptitude.SPRINTER,
        dateOfBirth: '2020-01-01',
      }),
    ).rejects.toThrow('dateOfBirth');
    expect(update).not.toHaveBeenCalled();
  });

  it('lets a head trainer change the race aptitude in their barn', async () => {
    await service.update(actorWith(UserRole.HEAD_TRAINER), 'h1', {
      version: 3,
      raceAptitude: RaceAptitude.SPRINTER,
    });
    expect(update).toHaveBeenCalledWith(
      { id: 'h1', version: 3 },
      { raceAptitude: RaceAptitude.SPRINTER },
    );
  });

  it('lets a club manager who is also a head trainer edit every field', async () => {
    trainerBarnQuery.mockResolvedValue([]);
    await service.update(
      {
        sub: 'kc-both',
        roles: [UserRole.CLUB_MANAGER, UserRole.HEAD_TRAINER],
      },
      'h1',
      { version: 3, name: 'Gió Nam' },
    );
    expect(update).toHaveBeenCalledWith(
      { id: 'h1', version: 3 },
      { name: 'Gió Nam' },
    );
  });

  it('skips the write and the audit when nothing changes', async () => {
    await service.update(actorWith(UserRole.CLUB_MANAGER), 'h1', {
      version: 3,
      name: 'Gió Bắc',
    });
    expect(update).not.toHaveBeenCalled();
    expect(record).not.toHaveBeenCalled();
  });

  it('audits the before and after values of the changed fields only', async () => {
    await service.update(actorWith(UserRole.CLUB_MANAGER), 'h1', {
      version: 3,
      name: 'Gió Nam',
      gender: HorseGender.MALE,
      raceAptitude: RaceAptitude.STAYER,
    });
    expect(record).toHaveBeenCalledWith(expect.anything(), {
      actorId: 'user-1',
      action: AuditAction.UPDATE,
      entityType: AuditEntityType.HORSE,
      entityId: 'h1',
      before: { name: 'Gió Bắc', raceAptitude: null },
      after: { name: 'Gió Nam', raceAptitude: RaceAptitude.STAYER },
    });
  });

  it('does not audit a write lost to a concurrent save', async () => {
    update.mockResolvedValue({ affected: 0 });
    await expect(
      service.update(actorWith(UserRole.CLUB_MANAGER), 'h1', {
        version: 3,
        name: 'Gió Nam',
      }),
    ).rejects.toThrow(ConflictException);
    expect(record).not.toHaveBeenCalled();
  });
});

describe('HorseProfilesService.remove', () => {
  const horse = Object.assign(new HorseEntity(), {
    id: 'h1',
    name: 'Thunder',
    microchipId: 'chip-1',
    lifecycleStatus: HorseLifecycleStatus.ACTIVE,
  });
  const body = { reason: 'Tạo nhầm' };
  let repository: Record<string, jest.Mock>;
  let update: jest.Mock;
  let softDelete: jest.Mock;
  let audit: { record: jest.Mock };
  let manager: Record<string, jest.Mock>;
  let service: HorseProfilesService;

  const remove = () =>
    service.remove(actorWith(UserRole.CLUB_MANAGER), 'h1', body);

  beforeEach(() => {
    repository = {
      lockHorse: jest.fn().mockResolvedValue(horse),
      lockPedigree: jest.fn(),
      parentUsage: jest.fn().mockResolvedValue({ asSire: false, asDam: false }),
      hasBusinessData: jest.fn().mockResolvedValue(false),
    };
    update = jest.fn();
    softDelete = jest.fn();
    manager = { getRepository: jest.fn(() => ({ update, softDelete })) };
    const dataSource = {
      manager: {
        findOne: jest.fn().mockResolvedValue({
          id: 'user-1',
          status: UserStatus.ACTIVE,
          role: UserRole.CLUB_MANAGER,
        }),
      },
      transaction: jest.fn((work: (m: unknown) => Promise<unknown>) =>
        work(manager),
      ),
    };
    audit = { record: jest.fn() };
    service = buildService(repository, dataSource, audit);
  });

  it('locks the pedigree before checking that no horse uses it as a parent', async () => {
    repository.parentUsage.mockResolvedValue({ asSire: false, asDam: true });
    await expect(remove()).rejects.toThrow(ConflictException);
    expect(repository.parentUsage).toHaveBeenCalledWith('h1', manager);
    expect(repository.lockPedigree.mock.invocationCallOrder[0]).toBeLessThan(
      repository.parentUsage.mock.invocationCallOrder[0],
    );
    expect(softDelete).not.toHaveBeenCalled();
  });

  it('locks the horse row before checking its business data', async () => {
    await remove();
    expect(repository.lockHorse).toHaveBeenCalledWith(manager, 'h1');
    expect(repository.hasBusinessData).toHaveBeenCalledWith('h1', manager);
    expect(repository.lockHorse.mock.invocationCallOrder[0]).toBeLessThan(
      repository.hasBusinessData.mock.invocationCallOrder[0],
    );
  });

  it('rejects when the horse already has business data', async () => {
    repository.hasBusinessData.mockResolvedValue(true);
    await expect(remove()).rejects.toThrow(ConflictException);
    expect(softDelete).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('returns 404 when the horse is not found', async () => {
    repository.lockHorse.mockResolvedValue(null);
    await expect(remove()).rejects.toThrow(NotFoundException);
    expect(softDelete).not.toHaveBeenCalled();
  });

  it('saves the reason, soft deletes and writes an audit log', async () => {
    await remove();
    expect(update).toHaveBeenCalledWith(
      { id: 'h1' },
      { deletedReason: 'Tạo nhầm' },
    );
    expect(softDelete).toHaveBeenCalledWith({ id: 'h1' });
    expect(audit.record).toHaveBeenCalledWith(manager, {
      actorId: 'user-1',
      action: AuditAction.DELETE,
      entityType: AuditEntityType.HORSE,
      entityId: 'h1',
      before: {
        name: 'Thunder',
        microchipId: 'chip-1',
        lifecycleStatus: HorseLifecycleStatus.ACTIVE,
      },
      after: { deletedReason: 'Tạo nhầm' },
    });
  });
});

describe('HorseProfilesService profile reads', () => {
  const horseWith = (patch: Partial<HorseEntity> = {}) =>
    Object.assign(new HorseEntity(), {
      id: 'h1',
      name: 'Gió Bắc',
      sireId: 'sire-1',
      damId: 'dam-1',
      isReference: false,
      healthStatus: HorseHealthStatus.ELIGIBLE,
      lifecycleStatus: HorseLifecycleStatus.ACTIVE,
      deletedAt: null,
      ...patch,
    });
  const measurement = (type: HorseMeasurementType, value: string) => ({
    type,
    value,
    measuredAt: new Date('2026-09-18T07:00:00Z'),
  });
  let repository: Record<string, jest.Mock>;
  let managerQuery: jest.Mock;
  let service: HorseProfilesService;

  beforeEach(() => {
    repository = {
      findById: jest.fn().mockResolvedValue(horseWith()),
      isVisible: jest.fn().mockResolvedValue(true),
      currentStallsByHorseIds: jest.fn().mockResolvedValue([
        {
          horseId: 'h1',
          stallId: 's1',
          stallCode: 'A-01',
          barnId: 'b1',
          barnName: 'Barn A',
        },
      ]),
      currentGroom: jest
        .fn()
        .mockResolvedValue({ id: 'groom-1', fullName: 'Trần B' }),
      representativeOwner: jest
        .fn()
        .mockResolvedValue({ id: 'owner-1', fullName: 'Nguyễn A' }),
      latestMeasurements: jest
        .fn()
        .mockResolvedValue([
          measurement(HorseMeasurementType.BODY_CONDITION, '5.00'),
          measurement(HorseMeasurementType.HEIGHT, '160.00'),
          measurement(HorseMeasurementType.TEMPERATURE, '37.80'),
          measurement(HorseMeasurementType.WEIGHT, '480.00'),
        ]),
      hasActiveTrainingLock: jest.fn().mockResolvedValue(false),
      isGroomAssigned: jest.fn().mockResolvedValue(false),
    };
    findReadableHorseMock.mockReset();
    findReadableHorseMock.mockResolvedValue(horseWith());
    managerQuery = jest.fn().mockResolvedValue([]);
    const dataSource = {
      manager: {
        findOne: jest.fn().mockResolvedValue({
          id: 'user-1',
          status: UserStatus.ACTIVE,
          role: UserRole.CLUB_MANAGER,
        }),
        query: managerQuery,
      },
    };
    service = buildService(repository, dataSource, { record: jest.fn() });
  });

  describe('visibility', () => {
    it('reads the horse through the shared access check with the caller id', async () => {
      await service.get(actorWith(UserRole.GROOM), 'h1');
      expect(findReadableHorseMock).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ roles: [UserRole.GROOM] }),
        'user-1',
        'h1',
      );
    });

    it('answers not found when the access check rejects the horse', async () => {
      findReadableHorseMock.mockRejectedValue(new NotFoundException());
      await expect(
        service.get(actorWith(UserRole.HORSE_OWNER), 'h1'),
      ).rejects.toThrow(NotFoundException);
      expect(repository.latestMeasurements).not.toHaveBeenCalled();
    });

    it('uses the same access check on the tab endpoints', async () => {
      findReadableHorseMock.mockRejectedValue(new NotFoundException());
      await expect(
        service.getPedigree(actorWith(UserRole.VETERINARIAN), 'h1'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('get', () => {
    it('returns the stall, groom and representative owner to a club manager', async () => {
      const detail = await service.get(actorWith(UserRole.CLUB_MANAGER), 'h1');
      expect(detail).toMatchObject({
        sireId: 'sire-1',
        damId: 'dam-1',
        stall: { id: 's1', code: 'A-01', barn: { id: 'b1', name: 'Barn A' } },
        groom: { id: 'groom-1', fullName: 'Trần B' },
        representativeOwner: { id: 'owner-1', fullName: 'Nguyễn A' },
      });
      expect(detail.latestMeasurements).toHaveLength(4);
      expect(detail).not.toHaveProperty('sire');
      expect(detail).not.toHaveProperty('dam');
    });

    it('returns null when the horse has no representative owner', async () => {
      repository.representativeOwner.mockResolvedValue(null);
      const detail = await service.get(actorWith(UserRole.HEAD_TRAINER), 'h1');
      expect(detail.representativeOwner).toBeNull();
    });

    it.each([UserRole.VETERINARIAN, UserRole.GROOM])(
      'leaves out the representativeOwner key for %s',
      async (role) => {
        const detail = await service.get(actorWith(role), 'h1');
        expect(detail).not.toHaveProperty('representativeOwner');
        expect(repository.representativeOwner).not.toHaveBeenCalled();
      },
    );

    it('gives a groom the latest value of every measurement type', async () => {
      const detail = await service.get(actorWith(UserRole.GROOM), 'h1');
      expect(detail.latestMeasurements).toHaveLength(4);
    });

    it('leaves out the parent IDs for a groom', async () => {
      const detail = await service.get(actorWith(UserRole.GROOM), 'h1');
      expect(detail).not.toHaveProperty('sireId');
      expect(detail).not.toHaveProperty('damId');
    });
  });

  describe('getPermissions', () => {
    it('passes the groom assignment of the caller to the rules', async () => {
      repository.isGroomAssigned.mockResolvedValue(true);
      const permissions = await service.getPermissions(
        actorWith(UserRole.GROOM),
        'h1',
      );
      expect(permissions).toMatchObject({
        horseId: 'h1',
        canRecordMeasurement: true,
        canViewPedigree: false,
      });
    });

    it('checks the barn of a head trainer', async () => {
      managerQuery.mockResolvedValue([{ '?column?': 1 }]);
      const permissions = await service.getPermissions(
        actorWith(UserRole.HEAD_TRAINER),
        'h1',
      );
      expect(permissions.canRecordMeasurement).toBe(true);
      expect(managerQuery).toHaveBeenCalledWith(expect.any(String), [
        'h1',
        'user-1',
      ]);
    });

    it('turns off the writes of a club manager on a deleted profile', async () => {
      findReadableHorseMock.mockResolvedValue(
        horseWith({ deletedAt: new Date() }),
      );
      const permissions = await service.getPermissions(
        actorWith(UserRole.CLUB_MANAGER),
        'h1',
      );
      expect(permissions.canEdit).toBe(false);
      expect(permissions.canViewOwners).toBe(true);
    });

    it('answers not found for a horse outside the caller scope', async () => {
      findReadableHorseMock.mockRejectedValue(new NotFoundException());
      await expect(
        service.getPermissions(actorWith(UserRole.HORSE_OWNER), 'h1'),
      ).rejects.toThrow(NotFoundException);
    });
  });
});

describe('HorseProfilesService.activate', () => {
  const stall = { id: 's1', barnId: 'b1', status: StallStatus.AVAILABLE };
  const reference = () =>
    Object.assign(new HorseEntity(), {
      id: 'h1',
      name: 'Northern Dancer',
      isReference: true,
      lifecycleStatus: HorseLifecycleStatus.ACTIVE,
      healthStatus: HorseHealthStatus.ELIGIBLE,
      version: 3,
    });
  let repository: {
    findById: jest.Mock;
    lockStall: jest.Mock;
    barnIsActive: jest.Mock;
    stallHasActiveAssignment: jest.Mock;
    assignStall: jest.Mock;
  };
  let horseRepo: { update: jest.Mock; create: jest.Mock; save: jest.Mock };
  let record: jest.Mock;
  let service: HorseProfilesService;

  beforeEach(() => {
    repository = {
      findById: jest.fn().mockResolvedValue(reference()),
      lockStall: jest.fn().mockResolvedValue(stall),
      barnIsActive: jest.fn().mockResolvedValue(true),
      stallHasActiveAssignment: jest.fn().mockResolvedValue(false),
      assignStall: jest.fn(),
    };
    horseRepo = {
      update: jest.fn().mockResolvedValue({ affected: 1 }),
      create: jest.fn((row: unknown) => row),
      save: jest.fn(),
    };
    record = jest.fn();
    const manager = {
      findOne: jest.fn().mockResolvedValue({
        id: 'user-1',
        status: UserStatus.ACTIVE,
        role: UserRole.CLUB_MANAGER,
      }),
      getRepository: jest.fn(() => horseRepo),
    };
    const dataSource = {
      manager,
      getRepository: jest.fn(() => ({
        find: jest.fn().mockResolvedValue([{ id: 'o1' }]),
      })),
      transaction: jest.fn((work: (m: typeof manager) => Promise<unknown>) =>
        work(manager),
      ),
    };
    service = buildService(repository, dataSource, { record });
  });

  it('rejects a horse that is already a club horse', async () => {
    repository.findById.mockResolvedValue(
      Object.assign(reference(), { isReference: false }),
    );
    await expect(
      service.activate(actorWith(UserRole.CLUB_MANAGER), 'h1', { version: 3 }),
    ).rejects.toThrow(ConflictException);
    expect(horseRepo.update).not.toHaveBeenCalled();
  });

  it('rejects a stale version', async () => {
    await expect(
      service.activate(actorWith(UserRole.CLUB_MANAGER), 'h1', { version: 2 }),
    ).rejects.toThrow(STALE_HORSE_MESSAGE);
    expect(horseRepo.update).not.toHaveBeenCalled();
  });

  it('rejects when someone else saved the horse during the write', async () => {
    horseRepo.update.mockResolvedValue({ affected: 0 });
    await expect(
      service.activate(actorWith(UserRole.CLUB_MANAGER), 'h1', { version: 3 }),
    ).rejects.toThrow(STALE_HORSE_MESSAGE);
    expect(record).not.toHaveBeenCalled();
  });

  it('turns the reference horse into a club horse with its stall and owners', async () => {
    await service.activate(actorWith(UserRole.CLUB_MANAGER), 'h1', {
      version: 3,
      stallId: 's1',
      owners: [{ ownerId: 'o1', percentage: 100 }],
    });
    expect(horseRepo.update).toHaveBeenCalledWith(
      { id: 'h1', version: 3 },
      {
        isReference: false,
        lifecycleStatus: HorseLifecycleStatus.ACTIVE,
        healthStatus: HorseHealthStatus.ELIGIBLE,
      },
    );
    expect(repository.assignStall).toHaveBeenCalledWith(
      expect.anything(),
      stall,
      'h1',
      expect.any(Date),
    );
    expect(horseRepo.save).toHaveBeenCalledWith([
      expect.objectContaining({ horseId: 'h1', ownerId: 'o1' }),
    ]);
    const [, entry] = record.mock.calls[0] as [
      unknown,
      {
        action: AuditAction;
        entityId: string;
        before: Record<string, unknown>;
        after: Record<string, unknown>;
      },
    ];
    expect(entry.action).toBe(AuditAction.UPDATE);
    expect(entry.entityId).toBe('h1');
    expect(entry.before.isReference).toBe(true);
    expect(entry.after.isReference).toBe(false);
  });

  it('activates without a stall or owners', async () => {
    await service.activate(actorWith(UserRole.CLUB_MANAGER), 'h1', {
      version: 3,
    });
    expect(horseRepo.update).toHaveBeenCalled();
    expect(repository.lockStall).not.toHaveBeenCalled();
    expect(horseRepo.save).not.toHaveBeenCalled();
  });
});

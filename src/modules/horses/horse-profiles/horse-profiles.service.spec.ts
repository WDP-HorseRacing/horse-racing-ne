import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, QueryFailedError, Repository } from 'typeorm';
import { UserRole } from '../../../common/enums/role.enum';
import { UserStatus } from '../../../common/enums/user-status.enum';
import { DomainEventPublisher } from '../../../common/infrastructure/events/domain-event.publisher';
import type { Actor } from '../../../common/types/actor';
import { AuditAction } from '../../audit/constants/audit-action.enum';
import { AuditEntityType } from '../../audit/constants/audit-entity-type.enum';
import { MediaService } from '../../media/services/media.service';
import { BarnsService } from '../../stable/barns/barns.service';
import { UserEntity } from '../../users/entities/user.entity';
import type { HorseListQueryDto, UpdateHorseDto } from '../dto';
import { HorseEntity } from '../entities/horse.entity';
import { EligibilityReason } from '../enums/eligibility-reason.enum';
import { HorseGender } from '../enums/horse-gender.enum';
import { HorseParentRole } from '../enums/horse-parent-role.enum';
import {
  HorseHealthStatus,
  HorseLifecycleStatus,
} from '../enums/horse-status.enum';
import {
  HORSE_BARN_ASSIGNED_EVENT,
  MICROCHIP_TAKEN_MESSAGE,
  STALE_HORSE_MESSAGE,
} from '../constants/horse.constants';
import { RaceAptitude } from '../enums/race-aptitude.enum';
import { HorseAccessService } from '../shared/horse-access.service';
import { HorsePedigreeRepository } from '../shared/horse-pedigree.repository';
import { HorsePedigreeService } from '../shared/horse-pedigree.service';
import { HorsesSharedRepository } from '../shared/horses-shared.repository';
import type { PedigreeAncestorRow } from '../types/horse.types';
import { HorseProfilesRepository } from './horse-profiles.repository';
import { HorseProfilesService } from './horse-profiles.service';

type HorseRow = Partial<HorseEntity> & { id: string };

const HORSE_ID = 'h1';
const CALLER_ID = 'user-1';
const anyString: unknown = expect.any(String);

const matchesParent = (child: HorseRow, where: Partial<HorseEntity>): boolean =>
  ('sireId' in where && child.sireId === where.sireId) ||
  ('damId' in where && child.damId === where.damId);

describe('HorseProfilesService', () => {
  let horse: HorseRow;
  let callerRole: UserRole;
  let barnRows: unknown[];
  let isActiveOwner: boolean;
  let microchipTaken: boolean;
  let horseRepository: {
    update: jest.Mock;
    softDelete: jest.Mock;
    restore: jest.Mock;
    existsBy: jest.Mock;
    exists: jest.Mock;
    findOne: jest.Mock;
  };
  let children: HorseRow[];
  let manager: {
    findOne: jest.Mock;
    query: jest.Mock;
    getRepository: jest.Mock;
  };
  let dataSource: {
    manager: typeof manager;
    transaction: jest.Mock;
    getRepository: jest.Mock;
  };
  let userRepository: { existsBy: jest.Mock };
  let profiles: Record<string, jest.Mock>;
  let horses: Record<string, jest.Mock>;
  let audit: { record: jest.Mock };
  let barnsService: { lockAssignableBarn: jest.Mock };
  let media: {
    assertAttachableHorsePhoto: jest.Mock;
    signDownloadUrl: jest.Mock;
  };
  let events: { publish: jest.Mock };
  let service: HorseProfilesService;

  const actorWith = (...roles: UserRole[]): Actor => {
    callerRole = roles[0];
    return { sub: `kc-${roles.join('-')}`, roles };
  };

  beforeEach(() => {
    horse = {
      id: HORSE_ID,
      name: 'Gió',
      gender: HorseGender.MALE,
      raceAptitude: null,
      microchipId: null,
      dateOfBirth: '2020-01-01',
      sireId: null,
      damId: null,
      ownerId: 'owner-1',
      barnId: 'b1',
      healthStatus: HorseHealthStatus.ELIGIBLE,
      lifecycleStatus: HorseLifecycleStatus.ACTIVE,
      version: 3,
      deletedAt: null,
      deletedReason: null,
    };
    children = [];
    callerRole = UserRole.CLUB_MANAGER;
    barnRows = [{ '?column?': 1 }];
    isActiveOwner = true;
    microchipTaken = false;
    horseRepository = {
      update: jest.fn().mockResolvedValue({ affected: 1 }),
      softDelete: jest.fn().mockResolvedValue({ affected: 1 }),
      restore: jest.fn().mockResolvedValue({ affected: 1 }),
      existsBy: jest.fn((where: Partial<HorseEntity>) =>
        Promise.resolve(
          children.some(
            (child) => !child.deletedAt && matchesParent(child, where),
          ),
        ),
      ),
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
      findOne: jest.fn(
        (options: { where: Partial<HorseEntity>[]; withDeleted?: boolean }) => {
          const dates = children
            .filter(
              (child) =>
                (options.withDeleted || !child.deletedAt) &&
                child.dateOfBirth &&
                options.where.some((where) => matchesParent(child, where)),
            )
            .map((child) => child.dateOfBirth as string)
            .sort();
          return Promise.resolve(
            dates.length > 0 ? { dateOfBirth: dates[0] } : null,
          );
        },
      ),
    };
    manager = {
      findOne: jest.fn((entity: unknown) =>
        Promise.resolve(
          entity === UserEntity
            ? { id: CALLER_ID, status: UserStatus.ACTIVE, role: callerRole }
            : entity === HorseEntity
              ? horse
              : null,
        ),
      ),
      query: jest.fn(() => Promise.resolve(barnRows)),
      getRepository: jest.fn(() => horseRepository),
    };
    userRepository = {
      existsBy: jest.fn(() => Promise.resolve(isActiveOwner)),
    };
    dataSource = {
      manager,
      transaction: jest.fn((work: (m: typeof manager) => Promise<unknown>) =>
        work(manager),
      ),
      getRepository: jest.fn(() => userRepository),
    };
    profiles = {
      list: jest.fn().mockResolvedValue([[], 0]),
      locationsByHorseIds: jest.fn().mockResolvedValue([]),
      currentGroom: jest.fn().mockResolvedValue(null),
      ownerOf: jest.fn().mockResolvedValue(null),
      findPedigreeAncestors: jest.fn().mockResolvedValue([]),
    };
    horses = {
      findById: jest.fn((id: string) =>
        Promise.resolve(id === HORSE_ID && !horse.deletedAt ? horse : null),
      ),
      findByIdWithDeleted: jest.fn(() => Promise.resolve(horse)),
      lockHorseWithDeleted: jest.fn(() => Promise.resolve(horse)),
      hasActiveTrainingLock: jest.fn().mockResolvedValue(false),
      activeTrainingLockHorseIds: jest.fn().mockResolvedValue(new Set()),
      latestMeasurements: jest.fn().mockResolvedValue([]),
      isGroomAssigned: jest.fn().mockResolvedValue(false),
      isHorseInTrainerBarn: jest.fn(() => Promise.resolve(barnRows.length > 0)),
      lockActiveHorseOwner: jest.fn(() => Promise.resolve(isActiveOwner)),
    };
    audit = { record: jest.fn().mockResolvedValue(undefined) };
    barnsService = { lockAssignableBarn: jest.fn().mockResolvedValue({}) };
    media = {
      assertAttachableHorsePhoto: jest.fn().mockResolvedValue({}),
      signDownloadUrl: jest.fn().mockResolvedValue('https://s3/get'),
    };
    events = { publish: jest.fn() };
    const typedDataSource = dataSource as unknown as DataSource;
    const sharedRepository = horses as unknown as HorsesSharedRepository;
    service = new HorseProfilesService(
      profiles as unknown as HorseProfilesRepository,
      {
        exists: jest.fn(() => Promise.resolve(microchipTaken)),
      } as unknown as Repository<HorseEntity>,
      sharedRepository,
      new HorseAccessService(typedDataSource, sharedRepository),
      new HorsePedigreeService(new HorsePedigreeRepository(), sharedRepository),
      media as unknown as MediaService,
      barnsService as unknown as BarnsService,
      events as unknown as DomainEventPublisher,
      typedDataSource,
      audit,
    );
  });

  describe('list', () => {
    it.each([
      UserRole.HEAD_TRAINER,
      UserRole.VETERINARIAN,
      UserRole.GROOM,
      UserRole.HORSE_OWNER,
    ])('rejects includeDeleted from %s with 403', async (role) => {
      await expect(
        service.list(actorWith(role), {
          includeDeleted: true,
          page: 1,
          limit: 20,
        } as HorseListQueryDto),
      ).rejects.toThrow(ForbiddenException);
      expect(profiles.list).not.toHaveBeenCalled();
    });

    it('lets a CLUB_MANAGER include deleted profiles', async () => {
      await service.list(actorWith(UserRole.CLUB_MANAGER), {
        includeDeleted: true,
        page: 1,
        limit: 20,
      } as HorseListQueryDto);
      expect(profiles.list).toHaveBeenCalledWith(
        { kind: 'ALL' },
        CALLER_ID,
        expect.objectContaining({ includeDeleted: true }),
      );
    });
  });

  describe('update', () => {
    const body = (fields: Partial<UpdateHorseDto>): UpdateHorseDto => ({
      version: 3,
      ...fields,
    });

    it('rejects a HEAD_TRAINER sending a field other than raceAptitude with 403', async () => {
      const result = service.update(
        actorWith(UserRole.HEAD_TRAINER),
        HORSE_ID,
        body({ raceAptitude: RaceAptitude.MILER, name: 'Bão' }),
      );
      await expect(result).rejects.toThrow(ForbiddenException);
      await expect(result).rejects.toThrow(/name/);
      expect(dataSource.transaction).not.toHaveBeenCalled();
    });

    it('rejects a CLUB_MANAGER sending raceAptitude with 403', async () => {
      await expect(
        service.update(
          actorWith(UserRole.CLUB_MANAGER),
          HORSE_ID,
          body({ raceAptitude: RaceAptitude.MILER }),
        ),
      ).rejects.toThrow(
        new ForbiddenException(
          'Chỉ Huấn luyện viên trưởng phụ trách khu mới được sửa sở trường cự ly',
        ),
      );
      expect(dataSource.transaction).not.toHaveBeenCalled();
      expect(horseRepository.update).not.toHaveBeenCalled();
    });

    it('rejects a HEAD_TRAINER outside the barn sending raceAptitude with 403', async () => {
      barnRows = [];
      await expect(
        service.update(
          actorWith(UserRole.HEAD_TRAINER),
          HORSE_ID,
          body({ raceAptitude: RaceAptitude.MILER }),
        ),
      ).rejects.toThrow(
        new ForbiddenException('Ngựa không thuộc khu bạn phụ trách'),
      );
      expect(horses.isHorseInTrainerBarn).toHaveBeenCalledWith(
        manager,
        HORSE_ID,
        CALLER_ID,
      );
      expect(horseRepository.update).not.toHaveBeenCalled();
    });

    it('lets a HEAD_TRAINER in the barn update raceAptitude with the version guard and audit', async () => {
      await service.update(
        actorWith(UserRole.HEAD_TRAINER),
        HORSE_ID,
        body({ raceAptitude: RaceAptitude.MILER }),
      );
      expect(horseRepository.update).toHaveBeenCalledWith(
        { id: HORSE_ID, version: 3 },
        { raceAptitude: RaceAptitude.MILER },
      );
      expect(audit.record).toHaveBeenCalledWith(
        manager,
        expect.objectContaining({
          action: AuditAction.UPDATE,
          entityType: AuditEntityType.HORSE,
          before: { raceAptitude: null },
          after: { raceAptitude: RaceAptitude.MILER },
        }),
      );
    });

    it('rejects an ownerId that is not an active HORSE_OWNER with 400', async () => {
      isActiveOwner = false;
      await expect(
        service.update(
          actorWith(UserRole.CLUB_MANAGER),
          HORSE_ID,
          body({ ownerId: 'someone' }),
        ),
      ).rejects.toThrow(BadRequestException);
      expect(horses.lockActiveHorseOwner).toHaveBeenCalledWith(
        manager,
        'someone',
      );
      expect(horseRepository.update).not.toHaveBeenCalled();
    });

    it('checks the new owner inside the transaction with a lock on the account', async () => {
      await service.update(
        actorWith(UserRole.CLUB_MANAGER),
        HORSE_ID,
        body({ ownerId: 'owner-2' }),
      );
      expect(dataSource.transaction).toHaveBeenCalled();
      expect(horses.lockActiveHorseOwner).toHaveBeenCalledWith(
        manager,
        'owner-2',
      );
      expect(
        horses.lockActiveHorseOwner.mock.invocationCallOrder[0],
      ).toBeGreaterThan(dataSource.transaction.mock.invocationCallOrder[0]);
    });

    it('rejects a HEAD_TRAINER outside the barn with 403 even when sending no field', async () => {
      barnRows = [];
      await expect(
        service.update(actorWith(UserRole.HEAD_TRAINER), HORSE_ID, {
          version: 3,
        }),
      ).rejects.toThrow(
        new ForbiddenException('Ngựa không thuộc khu bạn phụ trách'),
      );
    });

    it('rejects a microchip already used by another horse with 409', async () => {
      microchipTaken = true;
      await expect(
        service.update(
          actorWith(UserRole.CLUB_MANAGER),
          HORSE_ID,
          body({ microchipId: 'CHIP-1' }),
        ),
      ).rejects.toThrow(new ConflictException(MICROCHIP_TAKEN_MESSAGE));
      expect(dataSource.transaction).not.toHaveBeenCalled();
    });

    it('maps a concurrent microchip unique violation to 409', async () => {
      horseRepository.update.mockRejectedValue(
        Object.assign(new QueryFailedError('UPDATE', [], new Error('dup')), {
          driverError: { code: '23505', constraint: 'horses_microchip_uq' },
        }),
      );
      await expect(
        service.update(
          actorWith(UserRole.CLUB_MANAGER),
          HORSE_ID,
          body({ microchipId: 'CHIP-2' }),
        ),
      ).rejects.toThrow(new ConflictException(MICROCHIP_TAKEN_MESSAGE));
    });

    it('rejects a stale version with 409', async () => {
      await expect(
        service.update(actorWith(UserRole.CLUB_MANAGER), HORSE_ID, {
          version: 2,
          name: 'Bão',
        }),
      ).rejects.toThrow(new ConflictException(STALE_HORSE_MESSAGE));
      expect(dataSource.transaction).not.toHaveBeenCalled();
    });

    it('maps a lost concurrent write (0 rows affected) to 409', async () => {
      horseRepository.update.mockResolvedValue({ affected: 0 });
      await expect(
        service.update(
          actorWith(UserRole.CLUB_MANAGER),
          HORSE_ID,
          body({ name: 'Bão' }),
        ),
      ).rejects.toThrow(new ConflictException(STALE_HORSE_MESSAGE));
      expect(audit.record).not.toHaveBeenCalled();
    });

    it('rejects a TRANSFERRED horse with 409', async () => {
      horse.lifecycleStatus = HorseLifecycleStatus.TRANSFERRED;
      await expect(
        service.update(
          actorWith(UserRole.CLUB_MANAGER),
          HORSE_ID,
          body({ name: 'Bão' }),
        ),
      ).rejects.toThrow(ConflictException);
      expect(dataSource.transaction).not.toHaveBeenCalled();
    });
  });

  describe('deleted profile', () => {
    const DELETED_MESSAGE =
      'Hồ sơ đã xóa, chỉ xem được. Khôi phục hồ sơ trước khi thao tác';

    beforeEach(() => {
      horse.deletedAt = new Date('2026-09-01T00:00:00Z');
    });

    it('rejects a CLUB_MANAGER updating a deleted profile with 403', async () => {
      await expect(
        service.update(actorWith(UserRole.CLUB_MANAGER), HORSE_ID, {
          version: 3,
          name: 'Bão',
        }),
      ).rejects.toThrow(new ForbiddenException(DELETED_MESSAGE));
      expect(dataSource.transaction).not.toHaveBeenCalled();
    });

    it('returns 404 to a HEAD_TRAINER updating a deleted profile', async () => {
      await expect(
        service.update(actorWith(UserRole.HEAD_TRAINER), HORSE_ID, {
          version: 3,
          raceAptitude: RaceAptitude.MILER,
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('getPedigree', () => {
    const ancestor = (id: string, ownerId: string | null) =>
      ({
        id,
        name: id,
        gender: HorseGender.MALE,
        breed: null,
        color: null,
        dateOfBirth: null,
        raceAptitude: null,
        ownerId,
        generation: 1,
        parentRole: HorseParentRole.SIRE,
        childId: HORSE_ID,
      }) satisfies PedigreeAncestorRow;

    beforeEach(() => {
      horse.ownerId = CALLER_ID;
      profiles.findPedigreeAncestors.mockResolvedValue([
        ancestor('mine', CALLER_ID),
        ancestor('theirs', 'other-owner'),
        ancestor('club', null),
      ]);
    });

    it('lets a HORSE_OWNER open only the ancestors they own and hides ownerId', async () => {
      const result = await service.getPedigree(
        actorWith(UserRole.HORSE_OWNER),
        HORSE_ID,
      );
      expect(
        result.ancestors.map(({ id, canOpen }) => ({ id, canOpen })),
      ).toEqual([
        { id: 'mine', canOpen: true },
        { id: 'theirs', canOpen: false },
        { id: 'club', canOpen: false },
      ]);
      expect(result.ancestors[0]).not.toHaveProperty('ownerId');
    });

    it('sends only the name and tree position of an ancestor a HORSE_OWNER cannot open', async () => {
      const result = await service.getPedigree(
        actorWith(UserRole.HORSE_OWNER),
        HORSE_ID,
      );
      expect(result.ancestors[1]).toStrictEqual({
        id: 'theirs',
        name: 'theirs',
        canOpen: false,
        generation: 1,
        parentRole: HorseParentRole.SIRE,
        childId: HORSE_ID,
      });
      expect(result.ancestors[0]).toStrictEqual({
        id: 'mine',
        name: 'mine',
        gender: HorseGender.MALE,
        breed: null,
        color: null,
        dateOfBirth: null,
        raceAptitude: null,
        canOpen: true,
        generation: 1,
        parentRole: HorseParentRole.SIRE,
        childId: HORSE_ID,
      });
    });

    it('lets other roles open every ancestor', async () => {
      const result = await service.getPedigree(
        actorWith(UserRole.VETERINARIAN),
        HORSE_ID,
      );
      expect(result.ancestors.every((node) => node.canOpen)).toBe(true);
    });

    it('returns 404 to a HORSE_OWNER who does not own the horse', async () => {
      horse.ownerId = 'other-owner';
      await expect(
        service.getPedigree(actorWith(UserRole.HORSE_OWNER), HORSE_ID),
      ).rejects.toThrow(NotFoundException);
      expect(profiles.findPedigreeAncestors).not.toHaveBeenCalled();
    });
  });

  describe('get', () => {
    beforeEach(() => {
      horse.ownerId = CALLER_ID;
      profiles.locationsByHorseIds.mockResolvedValue([
        {
          horseId: HORSE_ID,
          barnId: 'b1',
          barnName: 'Khu A',
          stallId: 's1',
          stallCode: 'A-01',
        },
      ]);
    });

    it('does not send barn and stall ids to a HORSE_OWNER', async () => {
      const result = await service.get(
        actorWith(UserRole.HORSE_OWNER),
        HORSE_ID,
      );
      expect(result.location.barn).toEqual({ name: 'Khu A' });
      expect(result.location.stall).toEqual({ code: 'A-01' });
    });

    it('sends barn and stall ids to other roles', async () => {
      const result = await service.get(
        actorWith(UserRole.CLUB_MANAGER),
        HORSE_ID,
      );
      expect(result.location.barn).toEqual({ id: 'b1', name: 'Khu A' });
      expect(result.location.stall).toEqual({ id: 's1', code: 'A-01' });
    });
  });

  describe('create', () => {
    let calls: string[];
    let barns: { lockAssignableBarn: jest.Mock };
    let createManager: typeof manager & { save: jest.Mock };

    beforeEach(() => {
      calls = [];
      barns = {
        lockAssignableBarn: jest.fn(() => {
          calls.push('lockAssignableBarn');
          return Promise.resolve({ id: 'b2' });
        }),
      };
      events.publish.mockImplementation(() => {
        calls.push('publish');
      });
      media.assertAttachableHorsePhoto.mockImplementation(() => {
        calls.push('assertAttachableHorsePhoto');
        return Promise.resolve({});
      });
      createManager = {
        ...manager,
        save: jest.fn((_entity: unknown, row: object) =>
          Promise.resolve({ id: 'h-new', ...row }),
        ),
      };
      const createDataSource = {
        manager: createManager,
        getRepository: jest.fn(() => userRepository),
        transaction: jest.fn(
          async (work: (m: typeof createManager) => Promise<unknown>) => {
            calls.push('transaction:start');
            const result = await work(createManager);
            calls.push('transaction:commit');
            return result;
          },
        ),
      };
      const typedDataSource = createDataSource as unknown as DataSource;
      const sharedRepository = horses as unknown as HorsesSharedRepository;
      service = new HorseProfilesService(
        profiles as unknown as HorseProfilesRepository,
        {
          exists: jest.fn().mockResolvedValue(false),
        } as unknown as Repository<HorseEntity>,
        sharedRepository,
        new HorseAccessService(typedDataSource, sharedRepository),
        new HorsePedigreeService(
          new HorsePedigreeRepository(),
          sharedRepository,
        ),
        media as unknown as MediaService,
        barns as unknown as BarnsService,
        events as unknown as DomainEventPublisher,
        typedDataSource,
        audit,
      );
    });

    it('locks the chosen barn inside the transaction and notifies after commit', async () => {
      const result = await service.create(actorWith(UserRole.CLUB_MANAGER), {
        name: 'Gió',
        gender: HorseGender.MALE,
        barnId: 'b2',
      });
      expect(barns.lockAssignableBarn).toHaveBeenCalledWith(
        createManager,
        'b2',
      );
      expect(createManager.save).toHaveBeenCalledWith(
        HorseEntity,
        expect.objectContaining({ barnId: 'b2' }),
      );
      expect(events.publish).toHaveBeenCalledWith(HORSE_BARN_ASSIGNED_EVENT, {
        eventId: anyString,
        horseId: 'h-new',
        barnId: 'b2',
      });
      expect(calls).toEqual([
        'transaction:start',
        'lockAssignableBarn',
        'transaction:commit',
        'publish',
      ]);
      expect(result).toMatchObject({ id: 'h-new' });
    });

    it('does not save or notify when the barn cannot take the horse', async () => {
      barns.lockAssignableBarn.mockRejectedValue(
        new ConflictException('Khu đã hết ô trống'),
      );
      await expect(
        service.create(actorWith(UserRole.CLUB_MANAGER), {
          name: 'Gió',
          gender: HorseGender.MALE,
          barnId: 'b2',
        }),
      ).rejects.toThrow(ConflictException);
      expect(createManager.save).not.toHaveBeenCalled();
      expect(events.publish).not.toHaveBeenCalled();
    });

    it('neither locks a barn nor notifies without a barnId', async () => {
      await service.create(actorWith(UserRole.CLUB_MANAGER), {
        name: 'Gió',
        gender: HorseGender.MALE,
      });
      expect(barns.lockAssignableBarn).not.toHaveBeenCalled();
      expect(createManager.save).toHaveBeenCalledWith(
        HorseEntity,
        expect.objectContaining({ barnId: null }),
      );
      expect(events.publish).not.toHaveBeenCalled();
    });

    it('checks the photo on storage before opening the transaction', async () => {
      await service.create(actorWith(UserRole.CLUB_MANAGER), {
        name: 'Gió',
        gender: HorseGender.MALE,
        mediaId: 'asset-1',
      });
      expect(media.assertAttachableHorsePhoto).toHaveBeenCalledWith(
        CALLER_ID,
        'asset-1',
      );
      expect(calls).toEqual([
        'assertAttachableHorsePhoto',
        'transaction:start',
        'transaction:commit',
      ]);
    });

    it('opens no transaction when the photo is not valid', async () => {
      media.assertAttachableHorsePhoto.mockRejectedValue(
        new NotFoundException('Không tìm thấy tệp'),
      );
      await expect(
        service.create(actorWith(UserRole.CLUB_MANAGER), {
          name: 'Gió',
          gender: HorseGender.MALE,
          mediaId: 'asset-1',
        }),
      ).rejects.toThrow(NotFoundException);
      expect(calls).toEqual([]);
    });
  });

  describe('update pedigree and photo', () => {
    const cm = () => actorWith(UserRole.CLUB_MANAGER);

    it('rejects a date of birth on or after a soft-deleted child with 400', async () => {
      children = [
        {
          id: 'foal',
          sireId: HORSE_ID,
          dateOfBirth: '2024-01-01',
          deletedAt: new Date('2026-09-01T00:00:00Z'),
        },
      ];
      await expect(
        service.update(cm(), HORSE_ID, {
          version: 3,
          dateOfBirth: '2024-06-01',
        }),
      ).rejects.toThrow(
        new BadRequestException('Cha/mẹ phải sinh trước ngựa con'),
      );
      expect(horseRepository.update).not.toHaveBeenCalled();
    });

    it('accepts a date of birth before every child', async () => {
      children = [{ id: 'foal', sireId: HORSE_ID, dateOfBirth: '2024-01-01' }];
      await service.update(cm(), HORSE_ID, {
        version: 3,
        dateOfBirth: '2019-01-01',
      });
      expect(horseRepository.update).toHaveBeenCalledWith(
        { id: HORSE_ID, version: 3 },
        { dateOfBirth: '2019-01-01' },
      );
    });

    it('checks a new photo on storage before opening the transaction', async () => {
      media.assertAttachableHorsePhoto.mockRejectedValue(
        new ConflictException('Tệp chưa được tải lên storage'),
      );
      await expect(
        service.update(cm(), HORSE_ID, { version: 3, mediaId: 'asset-2' }),
      ).rejects.toThrow(ConflictException);
      expect(media.assertAttachableHorsePhoto).toHaveBeenCalledWith(
        CALLER_ID,
        'asset-2',
      );
      expect(dataSource.transaction).not.toHaveBeenCalled();
    });
  });

  describe('getPhotoUrl', () => {
    it('signs the photo of a horse the caller can read', async () => {
      horse.mediaId = 'asset-1';
      await expect(
        service.getPhotoUrl(actorWith(UserRole.GROOM), HORSE_ID),
      ).resolves.toEqual({ url: 'https://s3/get' });
      expect(media.signDownloadUrl).toHaveBeenCalledWith('asset-1');
    });

    it('returns 404 when the horse has no photo', async () => {
      horse.mediaId = null;
      await expect(
        service.getPhotoUrl(actorWith(UserRole.GROOM), HORSE_ID),
      ).rejects.toThrow(new NotFoundException('Ngựa chưa có ảnh đại diện'));
      expect(media.signDownloadUrl).not.toHaveBeenCalled();
    });

    it('returns 404 to an owner who does not own the horse, without signing', async () => {
      horse.mediaId = 'asset-1';
      horse.ownerId = 'other-owner';
      await expect(
        service.getPhotoUrl(actorWith(UserRole.HORSE_OWNER), HORSE_ID),
      ).rejects.toThrow(NotFoundException);
      expect(media.signDownloadUrl).not.toHaveBeenCalled();
    });
  });

  describe('getEligibility', () => {
    it('blocks training and racing for a horse under an active training lock', async () => {
      horses.hasActiveTrainingLock.mockResolvedValue(true);
      await expect(
        service.getEligibility(actorWith(UserRole.VETERINARIAN), HORSE_ID),
      ).resolves.toEqual({
        horseId: HORSE_ID,
        healthStatus: HorseHealthStatus.ELIGIBLE,
        lifecycleStatus: HorseLifecycleStatus.ACTIVE,
        activeTrainingLock: true,
        trainingEligible: false,
        racingEligible: false,
        reasons: [EligibilityReason.ACTIVE_TRAINING_LOCK],
      });
    });

    it('returns 404 to a role other than CLUB_MANAGER on a deleted profile', async () => {
      horse.deletedAt = new Date('2026-09-01T00:00:00Z');
      await expect(
        service.getEligibility(actorWith(UserRole.VETERINARIAN), HORSE_ID),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('getPermissions', () => {
    it('checks the barn only for a HEAD_TRAINER and turns on the trainer flags', async () => {
      const result = await service.getPermissions(
        actorWith(UserRole.HEAD_TRAINER),
        HORSE_ID,
      );
      expect(horses.isHorseInTrainerBarn).toHaveBeenCalledWith(
        manager,
        HORSE_ID,
        CALLER_ID,
      );
      expect(horses.isGroomAssigned).not.toHaveBeenCalled();
      expect(result).toMatchObject({
        horseId: HORSE_ID,
        canEditRaceAptitude: true,
        canAssignStallAndGroom: true,
        canEditProfile: false,
      });
    });

    it('checks the groom assignment only for a GROOM', async () => {
      horses.isGroomAssigned.mockResolvedValue(true);
      const result = await service.getPermissions(
        actorWith(UserRole.GROOM),
        HORSE_ID,
      );
      expect(horses.isHorseInTrainerBarn).not.toHaveBeenCalled();
      expect(result).toMatchObject({
        canRecordMeasurement: true,
        canViewMedicalTab: false,
      });
    });

    it('lets a CLUB_MANAGER only restore a deleted profile', async () => {
      horse.deletedAt = new Date('2026-09-01T00:00:00Z');
      const result = await service.getPermissions(
        actorWith(UserRole.CLUB_MANAGER),
        HORSE_ID,
      );
      expect(result).toMatchObject({
        canRestore: true,
        canDelete: false,
        canEditProfile: false,
      });
    });
  });
});

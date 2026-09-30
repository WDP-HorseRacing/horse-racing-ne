import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { DomainEventPublisher } from '../../../common/infrastructure/events/domain-event.publisher';
import { UserRole } from '../../../common/enums/role.enum';
import { UserStatus } from '../../../common/enums/user-status.enum';
import type { Actor } from '../../../common/types/actor';
import { AuditAction } from '../../audit/constants/audit-action.enum';
import { AuditEntityType } from '../../audit/constants/audit-entity-type.enum';
import { BarnsService } from '../../stable/barns/barns.service';
import { GROOM_ASSIGNMENT_CHANGED_EVENT } from '../../stable/constants/stable-events.constants';
import { GroomAssignmentsService } from '../../stable/groom-assignments/groom-assignments.service';
import { StallsService } from '../../stable/stalls/stalls.service';
import { TrainingOperationsFacade } from '../../training/shared/training-operations.facade';
import { UserEntity } from '../../users/entities/user.entity';
import { HorseEntity } from '../entities/horse.entity';
import { HorseLifecycleStatus } from '../enums/horse-status.enum';
import { HorseAccessService } from '../shared/horse-access.service';
import { HORSE_BARN_ASSIGNED_EVENT } from '../constants/horse.constants';
import { HorsesSharedRepository } from '../shared/horses-shared.repository';
import { HorsePlacementsRepository } from './horse-placements.repository';
import { HorsePlacementsService } from './horse-placements.service';

type HorseRow = Partial<HorseEntity> & { id: string };

const HORSE_ID = 'h1';
const anyString: unknown = expect.any(String);
const anyDate: unknown = expect.any(Date);
const CALLER_ID = 'cm-1';

describe('HorsePlacementsService', () => {
  let horse: HorseRow;
  let calls: string[];
  let horseRepository: { update: jest.Mock };
  let manager: { findOne: jest.Mock; getRepository: jest.Mock };
  let horses: {
    lockHorseWithDeleted: jest.Mock;
    findById: jest.Mock;
    findByIdWithDeleted: jest.Mock;
  };
  let barns: { lockAssignableBarn: jest.Mock };
  let stalls: {
    releaseStallByHorse: jest.Mock;
    moveHorseToStallInTransaction: jest.Mock;
  };
  let grooms: { assignInTransaction: jest.Mock };
  let training: { withdrawHorseFromClasses: jest.Mock };
  let events: { publish: jest.Mock };
  let audit: { record: jest.Mock };
  let placements: { findBarn: jest.Mock; barnChangeImpact: jest.Mock };
  let service: HorsePlacementsService;

  const actor = (): Actor => ({ sub: 'kc-cm', roles: [UserRole.CLUB_MANAGER] });
  const assign = (barnId = 'b2') =>
    service.assignBarn(actor(), HORSE_ID, { barnId, reason: 'Cân bằng khu' });
  const track = (name: string, value?: unknown) => (): Promise<unknown> => {
    calls.push(name);
    return Promise.resolve(value);
  };

  const expectNoWrite = () => {
    expect(stalls.releaseStallByHorse).not.toHaveBeenCalled();
    expect(training.withdrawHorseFromClasses).not.toHaveBeenCalled();
    expect(horseRepository.update).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
    expect(events.publish).not.toHaveBeenCalled();
  };

  beforeEach(() => {
    horse = {
      id: HORSE_ID,
      barnId: 'b1',
      lifecycleStatus: HorseLifecycleStatus.ACTIVE,
    };
    calls = [];
    horseRepository = {
      update: jest.fn(track('update', { affected: 1 })),
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
      getRepository: jest.fn(() => horseRepository),
    };
    const dataSource = {
      manager,
      transaction: jest.fn(
        async (work: (m: typeof manager) => Promise<unknown>) => {
          calls.push('transaction:start');
          const result = await work(manager);
          calls.push('transaction:commit');
          return result;
        },
      ),
    };
    horses = {
      lockHorseWithDeleted: jest.fn(() => Promise.resolve(horse)),
      findById: jest.fn(() => Promise.resolve(horse.deletedAt ? null : horse)),
      findByIdWithDeleted: jest.fn(() => Promise.resolve(horse)),
    };
    barns = {
      lockAssignableBarn: jest.fn(
        track('lockAssignableBarn', { id: 'b2', headTrainerId: 'ht-2' }),
      ),
    };
    grooms = {
      assignInTransaction: jest.fn(
        track('assignInTransaction', {
          response: { id: 'ga-1', groomId: 'g-1' },
          notice: { eventId: 'ga-1', horseId: HORSE_ID },
        }),
      ),
    };
    stalls = {
      moveHorseToStallInTransaction: jest.fn(
        track('moveHorseToStallInTransaction', { id: 'sa-1', stallId: 's1' }),
      ),
      releaseStallByHorse: jest.fn(
        track('releaseStallByHorse', { stallId: 's1', stallCode: 'A-01' }),
      ),
    };
    events = {
      publish: jest.fn(() => {
        calls.push('publish');
      }),
    };
    training = {
      withdrawHorseFromClasses: jest.fn(
        track('withdrawHorseFromClasses', {
          classIds: ['c1'],
          participantsCancelled: 2,
        }),
      ),
    };
    audit = { record: jest.fn(track('audit')) };
    placements = {
      findBarn: jest.fn(() =>
        Promise.resolve({
          id: 'b2',
          name: 'Khu C',
          headTrainerId: 'ht-2',
          headTrainerName: 'Hoa',
        }),
      ),
      barnChangeImpact: jest.fn(() =>
        Promise.resolve({
          fromBarnName: 'Khu A',
          stallCode: 'A-01',
          groomName: 'Lan',
          classesToWithdraw: 2,
        }),
      ),
    };
    const typedDataSource = dataSource as unknown as DataSource;
    const sharedRepository = horses as unknown as HorsesSharedRepository;
    service = new HorsePlacementsService(
      new HorseAccessService(typedDataSource, sharedRepository),
      barns as unknown as BarnsService,
      stalls as unknown as StallsService,
      events as unknown as DomainEventPublisher,
      typedDataSource,
      audit,
      training as unknown as TrainingOperationsFacade,
      grooms as unknown as GroomAssignmentsService,
      placements as unknown as HorsePlacementsRepository,
    );
  });

  it('returns 404 when the horse is missing', async () => {
    horses.lockHorseWithDeleted.mockResolvedValue(null);
    await expect(assign()).rejects.toThrow(NotFoundException);
    expect(barns.lockAssignableBarn).not.toHaveBeenCalled();
    expectNoWrite();
  });

  it('rejects a CLUB_MANAGER on a deleted profile with 409 before locking the barn', async () => {
    horse.deletedAt = new Date('2026-09-01T00:00:00Z');
    await expect(assign()).rejects.toThrow(
      new ConflictException(
        'Hồ sơ đã xóa, chỉ xem được. Khôi phục hồ sơ trước khi thao tác',
      ),
    );
    expect(barns.lockAssignableBarn).not.toHaveBeenCalled();
    expectNoWrite();
  });

  it('rejects a TRANSFERRED horse with 409 before locking the barn', async () => {
    horse.lifecycleStatus = HorseLifecycleStatus.TRANSFERRED;
    await expect(assign()).rejects.toThrow(ConflictException);
    expect(barns.lockAssignableBarn).not.toHaveBeenCalled();
    expectNoWrite();
  });

  it('changes nothing and sends no notification for the current barn', async () => {
    await expect(assign('b1')).resolves.toMatchObject({ id: HORSE_ID });
    expect(barns.lockAssignableBarn).not.toHaveBeenCalled();
    expectNoWrite();
  });

  it('moves the horse to the new barn and notifies after the commit', async () => {
    await assign('b2');
    expect(barns.lockAssignableBarn).toHaveBeenCalledWith(manager, 'b2');
    expect(stalls.releaseStallByHorse).toHaveBeenCalledWith(manager, HORSE_ID);
    expect(horseRepository.update).toHaveBeenCalledWith(
      { id: HORSE_ID },
      { barnId: 'b2' },
    );
    expect(audit.record).toHaveBeenCalledWith(manager, {
      actorId: CALLER_ID,
      action: AuditAction.UPDATE,
      entityType: AuditEntityType.HORSE,
      entityId: HORSE_ID,
      before: { barnId: 'b1', stallCode: 'A-01' },
      after: { barnId: 'b2', stallCode: null, classesWithdrawn: 1 },
      reason: 'Cân bằng khu',
      feature: 'F1.6',
    });
    expect(events.publish).toHaveBeenCalledWith(HORSE_BARN_ASSIGNED_EVENT, {
      eventId: anyString,
      horseId: HORSE_ID,
      barnId: 'b2',
    });
    expect(calls).toEqual([
      'transaction:start',
      'lockAssignableBarn',
      'releaseStallByHorse',
      'withdrawHorseFromClasses',
      'update',
      'audit',
      'transaction:commit',
      'publish',
    ]);
  });

  it('records a null old stall when the horse had no stall', async () => {
    stalls.releaseStallByHorse.mockResolvedValue(null);
    await assign('b2');
    expect(audit.record).toHaveBeenCalledWith(
      manager,
      expect.objectContaining({
        before: { barnId: 'b1', stallCode: null },
      }),
    );
  });

  it('places a horse without a barn yet', async () => {
    horse.barnId = null;
    await assign('b2');
    expect(horseRepository.update).toHaveBeenCalledWith(
      { id: HORSE_ID },
      { barnId: 'b2' },
    );
    expect(events.publish).toHaveBeenCalledWith(
      HORSE_BARN_ASSIGNED_EVENT,
      expect.objectContaining({ horseId: HORSE_ID, barnId: 'b2' }),
    );
  });

  it('places a horse waiting for a barn without a reason', async () => {
    horse.barnId = null;
    await service.assignBarn(actor(), HORSE_ID, { barnId: 'b2' });
    expect(horseRepository.update).toHaveBeenCalledWith(
      { id: HORSE_ID },
      { barnId: 'b2' },
    );
    expect(audit.record).toHaveBeenCalledWith(
      manager,
      expect.objectContaining({ reason: null, feature: 'F1.6' }),
    );
  });

  it('requires a reason to move a horse that already has a barn', async () => {
    await expect(
      service.assignBarn(actor(), HORSE_ID, { barnId: 'b2' }),
    ).rejects.toThrow(new BadRequestException('Đổi khu bắt buộc nhập lý do'));
    expect(horseRepository.update).not.toHaveBeenCalled();
    expect(events.publish).not.toHaveBeenCalled();
  });

  it('neither updates nor notifies when the barn cannot take the horse', async () => {
    barns.lockAssignableBarn.mockRejectedValue(
      new ConflictException('Khu đã hết ô trống'),
    );
    await expect(assign('b2')).rejects.toThrow(
      new ConflictException('Khu đã hết ô trống'),
    );
    expectNoWrite();
  });

  it('withdraws the horse from every class not led by the new barn head trainer', async () => {
    await assign('b2');
    expect(training.withdrawHorseFromClasses).toHaveBeenCalledWith(
      manager,
      HORSE_ID,
      {
        reason: 'Đổi khu: Cân bằng khu',
        at: anyDate,
        exceptHeadTrainerId: 'ht-2',
      },
    );
  });

  it('adds no classesWithdrawn to the audit when no class was left', async () => {
    training.withdrawHorseFromClasses.mockResolvedValue({
      classIds: [],
      participantsCancelled: 0,
    });
    await assign('b2');
    expect(audit.record).toHaveBeenCalledWith(
      manager,
      expect.objectContaining({
        after: { barnId: 'b2', stallCode: null },
      }),
    );
  });

  describe('placeHorse', () => {
    const htActor = (): Actor => ({
      sub: 'kc-ht',
      roles: [UserRole.HEAD_TRAINER],
    });
    const place = () =>
      service.placeHorse(htActor(), HORSE_ID, {
        stallId: 's1',
        groomId: 'g-1',
      });

    it('places the stall and the groom in one transaction and notifies after the commit', async () => {
      const result = await place();

      expect(stalls.moveHorseToStallInTransaction).toHaveBeenCalledWith(
        manager,
        CALLER_ID,
        HORSE_ID,
        's1',
      );
      expect(grooms.assignInTransaction).toHaveBeenCalledWith(
        manager,
        CALLER_ID,
        HORSE_ID,
        'g-1',
      );
      expect(calls).toEqual([
        'transaction:start',
        'moveHorseToStallInTransaction',
        'assignInTransaction',
        'transaction:commit',
        'publish',
      ]);
      expect(events.publish).toHaveBeenCalledWith(
        GROOM_ASSIGNMENT_CHANGED_EVENT,
        { eventId: 'ga-1', horseId: HORSE_ID },
      );
      expect(result).toEqual({
        stallAssignment: { id: 'sa-1', stallId: 's1' },
        groomAssignment: { id: 'ga-1', groomId: 'g-1' },
      });
    });

    it('fails as a whole and notifies nobody when the groom part fails', async () => {
      grooms.assignInTransaction.mockRejectedValue(
        new ConflictException('Groom phụ trách không ở trạng thái hoạt động'),
      );

      await expect(place()).rejects.toThrow(ConflictException);
      expect(calls).not.toContain('transaction:commit');
      expect(events.publish).not.toHaveBeenCalled();
    });
  });

  describe('previewBarnChange', () => {
    const preview = (barnId = 'b2') =>
      service.previewBarnChange(actor(), HORSE_ID, { barnId });

    beforeEach(() => {
      horse.name = 'Winx';
    });

    it('lists every consequence and a summary without writing anything', async () => {
      const result = await preview();

      expect(placements.barnChangeImpact).toHaveBeenCalledWith(
        HORSE_ID,
        'ht-2',
      );
      expect(result).toEqual({
        horseId: HORSE_ID,
        allowed: true,
        blockedReason: null,
        fromBarnName: 'Khu A',
        toBarnName: 'Khu C',
        newHeadTrainerName: 'Hoa',
        stallReleased: 'A-01',
        classesWithdrawn: 2,
        groomKept: 'Lan',
        summary:
          'Nếu chuyển Winx sang Khu C sẽ trả ô A-01, rút khỏi 2 lớp; Groom Lan giữ nguyên; ngựa vào Chờ xếp ô của Head Trainer Hoa.',
      });
      expect(calls).not.toContain('transaction:start');
      expectNoWrite();
    });

    it('returns allowed = false with the reason when the horse is already in that barn', async () => {
      placements.findBarn.mockResolvedValue({
        id: 'b1',
        name: 'Khu A',
        headTrainerId: 'ht-1',
        headTrainerName: 'Nam',
      });

      const result = await preview('b1');

      expect(result).toMatchObject({
        allowed: false,
        blockedReason: 'Ngựa đang ở khu này',
        stallReleased: null,
        classesWithdrawn: 0,
        summary: null,
      });
    });

    it('returns allowed = false for a TRANSFERRED horse', async () => {
      horse.lifecycleStatus = HorseLifecycleStatus.TRANSFERRED;

      const result = await preview();

      expect(result).toMatchObject({
        allowed: false,
        blockedReason: 'Ngựa đã chuyển nhượng, hồ sơ chỉ đọc',
      });
    });

    it('returns 404 when the barn is missing', async () => {
      placements.findBarn.mockResolvedValue(null);

      await expect(preview('b9')).rejects.toThrow(NotFoundException);
      expect(placements.barnChangeImpact).not.toHaveBeenCalled();
    });

    it('returns 409 on a deleted profile and reads no barn', async () => {
      horse.deletedAt = new Date('2026-09-01T00:00:00Z');

      await expect(preview()).rejects.toThrow(ConflictException);
      expect(placements.findBarn).not.toHaveBeenCalled();
    });
  });
});

import {
  ConflictException,
  ForbiddenException,
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
import { StallsService } from '../../stable/stalls/stalls.service';
import { UserEntity } from '../../users/entities/user.entity';
import { HorseEntity } from '../entities/horse.entity';
import { HorseLifecycleStatus } from '../enums/horse-status.enum';
import { HorseAccessService } from '../shared/horse-access.service';
import { HORSE_BARN_ASSIGNED_EVENT } from '../constants/horse.constants';
import { HorsesSharedRepository } from '../shared/horses-shared.repository';
import { HorsePlacementsService } from './horse-placements.service';

type HorseRow = Partial<HorseEntity> & { id: string };

const HORSE_ID = 'h1';
const anyString: unknown = expect.any(String);
const CALLER_ID = 'cm-1';

describe('HorsePlacementsService', () => {
  let horse: HorseRow;
  let calls: string[];
  let horseRepository: { update: jest.Mock };
  let manager: { findOne: jest.Mock; getRepository: jest.Mock };
  let horses: {
    lockHorseWithDeleted: jest.Mock;
    findById: jest.Mock;
  };
  let barns: { lockAssignableBarn: jest.Mock };
  let stalls: { releaseStallByHorse: jest.Mock };
  let events: { publish: jest.Mock };
  let audit: { record: jest.Mock };
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
    };
    barns = {
      lockAssignableBarn: jest.fn(track('lockAssignableBarn', { id: 'b2' })),
    };
    stalls = {
      releaseStallByHorse: jest.fn(
        track('releaseStallByHorse', { stallId: 's1', stallCode: 'A-01' }),
      ),
    };
    events = {
      publish: jest.fn(() => {
        calls.push('publish');
      }),
    };
    audit = { record: jest.fn(track('audit')) };
    const typedDataSource = dataSource as unknown as DataSource;
    const sharedRepository = horses as unknown as HorsesSharedRepository;
    service = new HorsePlacementsService(
      new HorseAccessService(typedDataSource, sharedRepository),
      barns as unknown as BarnsService,
      stalls as unknown as StallsService,
      events as unknown as DomainEventPublisher,
      typedDataSource,
      audit,
    );
  });

  it('returns 404 when the horse is missing', async () => {
    horses.lockHorseWithDeleted.mockResolvedValue(null);
    await expect(assign()).rejects.toThrow(NotFoundException);
    expect(barns.lockAssignableBarn).not.toHaveBeenCalled();
    expectNoWrite();
  });

  it('rejects a CLUB_MANAGER on a deleted profile with 403 before locking the barn', async () => {
    horse.deletedAt = new Date('2026-09-01T00:00:00Z');
    await expect(assign()).rejects.toThrow(
      new ForbiddenException(
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
      after: { barnId: 'b2', stallCode: null },
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

  it('neither updates nor notifies when the barn cannot take the horse', async () => {
    barns.lockAssignableBarn.mockRejectedValue(
      new ConflictException('Khu đã hết ô trống'),
    );
    await expect(assign('b2')).rejects.toThrow(
      new ConflictException('Khu đã hết ô trống'),
    );
    expectNoWrite();
  });
});

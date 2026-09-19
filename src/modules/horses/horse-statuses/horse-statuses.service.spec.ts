import { ConflictException, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { UserRole } from '../../../common/enums/role.enum';
import { UserStatus } from '../../../common/enums/user-status.enum';
import type { Actor } from '../../../common/types/actor';
import { AuditAction } from '../../audit/constants/audit-action.enum';
import {
  HorseHealthStatus,
  HorseLifecycleStatus,
} from '../constants/horse-status.enum';
import { HorseEntity } from '../entities/horse.entity';
import { HorseAccessService } from '../shared/horse-access.service';
import { HorseOwnersService } from '../shared/horse-owners.service';
import { HorsesSharedRepository } from '../shared/horses-shared.repository';
import { HorseStatusesService } from './horse-statuses.service';

function actorWith(role: UserRole): Actor {
  return { sub: `kc-${role}`, roles: [role] };
}

describe('HorseStatusesService.updateLifecycle', () => {
  const actor = actorWith(UserRole.CLUB_MANAGER);
  let horse: HorseEntity;
  let statuses: {
    hasRunningActivity: jest.Mock;
    cancelOpenTrainingPlans: jest.Mock;
    withdrawOpenRegistrations: jest.Mock;
    releaseActiveTrainingLock: jest.Mock;
    closeActiveGroomAssignment: jest.Mock;
    closeActiveStallAssignment: jest.Mock;
  };
  let lockHorse: jest.Mock;
  let horseUpdate: jest.Mock;
  let closeActiveOwnerships: jest.Spied<
    HorseOwnersService['closeActiveOwnerships']
  >;
  let audit: { record: jest.Mock };
  let service: HorseStatusesService;

  const change = (lifecycleStatus: HorseLifecycleStatus) =>
    service.updateLifecycle(actor, 'h1', { lifecycleStatus, reason: 'Lý do' });

  beforeEach(() => {
    horse = Object.assign(new HorseEntity(), {
      id: 'h1',
      isReference: false,
      healthStatus: HorseHealthStatus.ELIGIBLE,
      lifecycleStatus: HorseLifecycleStatus.ACTIVE,
      lifecycleReason: null,
    });
    statuses = {
      hasRunningActivity: jest.fn().mockResolvedValue(false),
      cancelOpenTrainingPlans: jest.fn(),
      withdrawOpenRegistrations: jest.fn(),
      releaseActiveTrainingLock: jest.fn(),
      closeActiveGroomAssignment: jest.fn(),
      closeActiveStallAssignment: jest.fn(),
    };
    horseUpdate = jest.fn();
    const manager = { getRepository: jest.fn(() => ({ update: horseUpdate })) };
    const dataSource = {
      manager: {
        findOne: jest.fn().mockResolvedValue({
          id: 'user-1',
          status: UserStatus.ACTIVE,
          role: UserRole.CLUB_MANAGER,
        }),
      },
      transaction: jest.fn((work: (m: typeof manager) => Promise<void>) =>
        work(manager),
      ),
    };
    const source = dataSource as unknown as DataSource;
    lockHorse = jest.fn().mockResolvedValue(horse);
    const shared = {
      findById: jest.fn().mockResolvedValue(horse),
      lockHorse,
    } as unknown as HorsesSharedRepository;
    const owners = new HorseOwnersService(source);
    closeActiveOwnerships = jest
      .spyOn(owners, 'closeActiveOwnerships')
      .mockResolvedValue();
    audit = { record: jest.fn() };
    service = new HorseStatusesService(
      statuses,
      shared,
      new HorseAccessService(source, shared),
      owners,
      source,
      audit,
    );
  });

  it('cancels training and withdraws registrations but keeps stall, owners and lock when retiring', async () => {
    await change(HorseLifecycleStatus.RETIRED);
    expect(statuses.cancelOpenTrainingPlans).toHaveBeenCalledWith(
      expect.anything(),
      'h1',
      'user-1',
      'Ngựa giải nghệ: Lý do',
      expect.any(Date),
    );
    expect(statuses.withdrawOpenRegistrations).toHaveBeenCalledWith(
      expect.anything(),
      'h1',
    );
    expect(statuses.closeActiveStallAssignment).not.toHaveBeenCalled();
    expect(statuses.closeActiveGroomAssignment).not.toHaveBeenCalled();
    expect(closeActiveOwnerships).not.toHaveBeenCalled();
    expect(statuses.releaseActiveTrainingLock).not.toHaveBeenCalled();
  });

  it('closes stall, owners, groom and releases the lock when transferring', async () => {
    await change(HorseLifecycleStatus.TRANSFERRED);
    expect(statuses.cancelOpenTrainingPlans).toHaveBeenCalled();
    expect(statuses.withdrawOpenRegistrations).toHaveBeenCalled();
    expect(closeActiveOwnerships).toHaveBeenCalledWith(
      expect.anything(),
      'h1',
      expect.any(Date),
    );
    expect(statuses.closeActiveGroomAssignment).toHaveBeenCalled();
    expect(statuses.closeActiveStallAssignment).toHaveBeenCalled();
    expect(statuses.releaseActiveTrainingLock).toHaveBeenCalledWith(
      expect.anything(),
      'h1',
      'Ngựa chuyển nhượng: Lý do',
      expect.any(Date),
    );
  });

  it('lets a RETIRED horse be transferred', async () => {
    horse.lifecycleStatus = HorseLifecycleStatus.RETIRED;
    await change(HorseLifecycleStatus.TRANSFERRED);
    expect(horseUpdate).toHaveBeenCalled();
  });

  it('only changes the status when a horse comes back as ACTIVE', async () => {
    horse.lifecycleStatus = HorseLifecycleStatus.TRANSFERRED;
    await change(HorseLifecycleStatus.ACTIVE);
    expect(statuses.hasRunningActivity).not.toHaveBeenCalled();
    expect(statuses.cancelOpenTrainingPlans).not.toHaveBeenCalled();
    expect(statuses.closeActiveStallAssignment).not.toHaveBeenCalled();
    expect(horseUpdate).toHaveBeenCalled();
  });

  it('saves the reason and the change time, and writes an audit log', async () => {
    await change(HorseLifecycleStatus.RETIRED);
    expect(horseUpdate).toHaveBeenCalledWith(
      { id: 'h1' },
      {
        lifecycleStatus: HorseLifecycleStatus.RETIRED,
        lifecycleReason: 'Lý do',
        lifecycleChangedAt: expect.any(Date) as Date,
      },
    );
    expect(audit.record).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: AuditAction.UPDATE,
        entityId: 'h1',
        before: {
          lifecycleStatus: HorseLifecycleStatus.ACTIVE,
          lifecycleReason: null,
        },
        after: {
          lifecycleStatus: HorseLifecycleStatus.RETIRED,
          lifecycleReason: 'Lý do',
        },
      }),
    );
  });

  it('rejects TRANSFERRED to RETIRED', async () => {
    horse.lifecycleStatus = HorseLifecycleStatus.TRANSFERRED;
    await expect(change(HorseLifecycleStatus.RETIRED)).rejects.toThrow(
      ConflictException,
    );
    expect(horseUpdate).not.toHaveBeenCalled();
  });

  it('rejects when the horse is training or racing right now', async () => {
    statuses.hasRunningActivity.mockResolvedValue(true);
    await expect(change(HorseLifecycleStatus.RETIRED)).rejects.toThrow(
      ConflictException,
    );
    expect(statuses.cancelOpenTrainingPlans).not.toHaveBeenCalled();
    expect(horseUpdate).not.toHaveBeenCalled();
  });

  it('returns 404 when the locked horse is not found', async () => {
    lockHorse.mockResolvedValue(null);
    await expect(change(HorseLifecycleStatus.RETIRED)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('does nothing when the status is unchanged', async () => {
    await change(HorseLifecycleStatus.ACTIVE);
    expect(horseUpdate).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });
});

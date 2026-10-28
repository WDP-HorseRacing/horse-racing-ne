import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { UserRole } from '../../../common/enums/role.enum';
import type { Actor } from '../../../common/types/actor';
import { AuditEntityType } from '../../audit/constants/audit-entity-type.enum';
import { HorseAccessService } from '../../horses/shared/horse-access.service';
import {
  MEDICAL_TRAINING_LOCK_RELEASED_EVENT,
  MEDICAL_TRAINING_LOCK_SET_EVENT,
} from '../constants/medical-events.constants';
import { TrainingLockStatus } from '../constants/training-lock.enum';
import { TrainingLockEntity } from '../entities/training-lock.entity';
import { MedicalAccessService } from '../shared/medical-access.service';
import { TrainingLockService } from './training-locks.service';
import { TrainingLockWritesService } from '../shared/training-lock-writes.service';

type Row = Record<string, unknown>;

const vet: Actor = { sub: 'kc-vet', roles: [UserRole.VETERINARIAN] };

describe('TrainingLockService set and release', () => {
  let activeExists: boolean;
  let lockRow: Row | null;
  let manager: {
    exists: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    findOneOrFail: jest.Mock;
    update: jest.Mock;
  };
  let locks: { findOne: jest.Mock; find: jest.Mock };
  let access: { lockHorseForWrite: jest.Mock; findOpenCase: jest.Mock };
  let horseAccess: { findReadableHorseForActor: jest.Mock };
  let shared: { findOpenCase: jest.Mock };
  let audit: { record: jest.Mock };
  let events: { publish: jest.Mock };
  let service: TrainingLockService;

  beforeEach(() => {
    activeExists = false;
    lockRow = {
      id: 'lock-1',
      horseId: 'h1',
      status: TrainingLockStatus.ACTIVE,
      reason: 'Nghỉ hồi phục',
      releasedBy: null,
    };
    manager = {
      exists: jest.fn(() => Promise.resolve(activeExists)),
      create: jest.fn((_entity: unknown, row: Row) => ({ ...row })),
      save: jest.fn((row: Row) => Promise.resolve({ id: 'lock-new', ...row })),
      findOneOrFail: jest.fn(() => Promise.resolve({ ...lockRow })),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    const dataSource = {
      manager,
      transaction: jest.fn((work: (m: typeof manager) => unknown) =>
        work(manager),
      ),
    };
    locks = {
      findOne: jest.fn(() => Promise.resolve(lockRow)),
      find: jest.fn().mockResolvedValue([]),
    };
    shared = { findOpenCase: jest.fn().mockResolvedValue(null) };
    access = {
      lockHorseForWrite: jest.fn().mockResolvedValue({
        caller: { id: 'vet-1' },
        horse: { id: 'h1' },
      }),
      findOpenCase: shared.findOpenCase,
    };
    horseAccess = { findReadableHorseForActor: jest.fn().mockResolvedValue({ id: 'h1' }) };
    audit = { record: jest.fn().mockResolvedValue(undefined) };
    events = { publish: jest.fn().mockResolvedValue(undefined) };
    service = new TrainingLockService(
      dataSource as unknown as DataSource,
      locks as unknown as Repository<TrainingLockEntity>,
      access as unknown as MedicalAccessService,
      new TrainingLockWritesService(),
      horseAccess as unknown as HorseAccessService,
      audit,
      events,
    );
  });

  describe('setLock', () => {
    it('answers conflict when the horse already has an active lock', async () => {
      activeExists = true;
      await expect(
        service.setLock(vet, 'h1', { reason: 'Nghỉ' }),
      ).rejects.toThrow(ConflictException);
      expect(manager.save).not.toHaveBeenCalled();
      expect(events.publish).not.toHaveBeenCalled();
    });

    it('rejects an expected end in the past', async () => {
      await expect(
        service.setLock(vet, 'h1', {
          reason: 'Nghỉ',
          lockEnd: '2020-01-01T00:00:00Z',
        }),
      ).rejects.toThrow(BadRequestException);
      expect(manager.save).not.toHaveBeenCalled();
    });

    it('propagates conflict for a transferred horse', async () => {
      access.lockHorseForWrite.mockRejectedValue(new ConflictException());
      await expect(
        service.setLock(vet, 'h1', { reason: 'Nghỉ' }),
      ).rejects.toThrow(ConflictException);
    });

    it('propagates not found for a horse outside the caller scope', async () => {
      access.lockHorseForWrite.mockRejectedValue(new NotFoundException());
      await expect(
        service.setLock(vet, 'h9', { reason: 'Nghỉ' }),
      ).rejects.toThrow(NotFoundException);
      expect(manager.save).not.toHaveBeenCalled();
      expect(events.publish).not.toHaveBeenCalled();
    });

    it('starts now, attaches the open case, audits and publishes in the transaction', async () => {
      shared.findOpenCase.mockResolvedValue({ id: 'case-1' });
      const result = await service.setLock(vet, 'h1', {
        reason: 'Hồi phục sau viêm gân',
      });
      expect(manager.create).toHaveBeenCalledWith(
        TrainingLockEntity,
        expect.objectContaining({
          lockedBy: 'vet-1',
          lockStart: expect.any(Date) as unknown,
          caseId: 'case-1',
          status: TrainingLockStatus.ACTIVE,
        }),
      );
      expect(audit.record).toHaveBeenCalledWith(
        manager,
        expect.objectContaining({ entityType: AuditEntityType.TRAINING_LOCK }),
      );
      expect(events.publish).toHaveBeenCalledWith(
        manager,
        MEDICAL_TRAINING_LOCK_SET_EVENT,
        expect.objectContaining({ lockId: 'lock-new', horseId: 'h1' }),
      );
      expect(result.caseId).toBe('case-1');
    });
  });

  describe('releaseLock', () => {
    it('answers not found for a missing lock', async () => {
      lockRow = null;
      await expect(
        service.releaseLock(vet, 'lock-404', { conclusion: 'Khỏi' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('answers conflict for a lock already released', async () => {
      lockRow = { ...lockRow, status: TrainingLockStatus.RELEASED };
      await expect(
        service.releaseLock(vet, 'lock-1', { conclusion: 'Khỏi' }),
      ).rejects.toThrow(ConflictException);
      expect(manager.update).not.toHaveBeenCalled();
      expect(events.publish).not.toHaveBeenCalled();
    });

    it.each([
      ['not found for a horse outside the caller scope', NotFoundException],
      ['conflict for a transferred horse', ConflictException],
    ])('propagates %s', async (_label, error) => {
      access.lockHorseForWrite.mockRejectedValue(new error());
      await expect(
        service.releaseLock(vet, 'lock-1', { conclusion: 'Khỏi' }),
      ).rejects.toThrow(error);
      expect(manager.update).not.toHaveBeenCalled();
      expect(events.publish).not.toHaveBeenCalled();
    });

    it('releases with the vet and reason, audits and publishes', async () => {
      const result = await service.releaseLock(vet, 'lock-1', {
        conclusion: 'Đã hồi phục',
      });
      expect(manager.update).toHaveBeenCalledWith(
        TrainingLockEntity,
        { id: 'lock-1' },
        expect.objectContaining({
          status: TrainingLockStatus.RELEASED,
          releasedBy: 'vet-1',
          releaseConclusion: 'Đã hồi phục',
        }),
      );
      expect(events.publish).toHaveBeenCalledWith(
        manager,
        MEDICAL_TRAINING_LOCK_RELEASED_EVENT,
        expect.objectContaining({ lockId: 'lock-1' }),
      );
      expect(result.releasedBySystem).toBe(false);
    });
  });

  describe('getLock', () => {
    it('answers not found for a missing lock', async () => {
      lockRow = null;
      await expect(service.getLock(vet, 'lock-404')).rejects.toThrow(
        NotFoundException,
      );
      expect(horseAccess.findReadableHorseForActor).not.toHaveBeenCalled();
    });

    it('answers not found when the horse of the lock is outside the caller scope', async () => {
      horseAccess.findReadableHorseForActor.mockRejectedValue(new NotFoundException());
      await expect(service.getLock(vet, 'lock-1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('returns the lock of a readable horse', async () => {
      const result = await service.getLock(vet, 'lock-1');
      expect(horseAccess.findReadableHorseForActor).toHaveBeenCalledWith(vet, 'h1');
      expect(result).toMatchObject({
        id: 'lock-1',
        status: TrainingLockStatus.ACTIVE,
      });
    });
  });

  describe('listByHorse', () => {
    it('answers not found for a horse outside the caller scope', async () => {
      horseAccess.findReadableHorseForActor.mockRejectedValue(new NotFoundException());
      await expect(
        service.listByHorse(
          { sub: 'kc-owner', roles: [UserRole.HORSE_OWNER] },
          'h9',
        ),
      ).rejects.toThrow(NotFoundException);
      expect(locks.find).not.toHaveBeenCalled();
    });

    it('marks a lock released by the system', async () => {
      locks.find.mockResolvedValue([
        {
          ...lockRow,
          status: TrainingLockStatus.RELEASED,
          releasedBy: null,
          releaseConclusion: 'Gỡ do chuyển nhượng',
        },
      ]);
      const [lock] = await service.listByHorse(vet, 'h1');
      expect(lock.releasedBySystem).toBe(true);
    });
  });
});

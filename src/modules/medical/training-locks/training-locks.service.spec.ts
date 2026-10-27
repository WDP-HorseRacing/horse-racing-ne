import { DataSource, EntityManager } from 'typeorm';
import type { Actor } from '../../../common/types/actor';
import {
  MEDICAL_TRAINING_LOCK_RELEASED_EVENT,
  MEDICAL_TRAINING_LOCK_SET_EVENT,
} from '../constants/medical-events.constants';
import { TrainingLockStatus } from '../constants/training-lock.enum';
import { TrainingLockEntity } from '../entities/training-lock.entity';
import { TrainingLockService } from './training-locks.service';
import { TrainingLockWritesService } from '../shared/training-lock-writes.service';

/**
 * Dựng service chỉ để gọi hàm hệ thống releaseActiveLockByHorse, không cần dependency nào.
 *
 * @returns TrainingLockService với dependency rỗng
 */
function systemService(): TrainingLockService {
  const unused = {} as never;
  return new TrainingLockService(
    unused,
    unused,
    unused,
    new TrainingLockWritesService(),
    unused,
    unused,
    unused,
  );
}

describe('TrainingLockService.releaseActiveLockByHorse', () => {
  const now = new Date('2026-09-23T08:00:00Z');
  let update: jest.Mock;
  let getRepository: jest.Mock;
  let manager: EntityManager;

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(now);
    update = jest.fn();
    getRepository = jest.fn(() => ({ update }));
    manager = { getRepository } as unknown as EntityManager;
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('releases the active lock through the given manager and returns true', async () => {
    update.mockResolvedValue({ affected: 1, raw: [], generatedMaps: [] });

    const released = await systemService().releaseActiveLockByHorse(
      manager,
      'h1',
      'Gỡ do chuyển nhượng',
    );

    expect(released).toBe(true);
    expect(getRepository).toHaveBeenCalledWith(TrainingLockEntity);
    expect(update).toHaveBeenCalledWith(
      { horseId: 'h1', status: TrainingLockStatus.ACTIVE },
      {
        status: TrainingLockStatus.RELEASED,
        releasedAt: now,
        releasedBy: null,
        releaseConclusion: 'Gỡ do chuyển nhượng',
      },
    );
  });

  it('returns false when the horse has no active lock', async () => {
    update.mockResolvedValue({ affected: 0, raw: [], generatedMaps: [] });

    const released = await systemService().releaseActiveLockByHorse(
      manager,
      'h2',
      'Gỡ do chuyển nhượng',
    );

    expect(released).toBe(false);
  });
});

describe('TrainingLockService events', () => {
  const vet = { sub: 'kc-vet' } as Actor;
  let publish: jest.Mock;
  let service: TrainingLockService;

  beforeEach(() => {
    publish = jest.fn();
    const manager = {
      exists: jest.fn().mockResolvedValue(false),
      create: jest.fn((_entity: unknown, data: object) => data),
      save: jest.fn((data: object) => Promise.resolve({ ...data, id: 'l1' })),
      findOneOrFail: jest.fn().mockResolvedValue({
        id: 'l1',
        horseId: 'h1',
        status: TrainingLockStatus.ACTIVE,
      }),
    };
    service = new TrainingLockService(
      {
        transaction: (run: (m: unknown) => unknown) => run(manager),
      } as unknown as DataSource,
      {
        findOne: jest.fn().mockResolvedValue({ id: 'l1', horseId: 'h1' }),
      } as never,
      {
        lockHorseForWrite: jest.fn().mockResolvedValue({
          caller: { id: 'vet-1' },
          horse: { id: 'h1', ownerId: 'owner-a' },
        }),
        findOpenCase: jest.fn().mockResolvedValue(null),
      } as never,
      {
        releaseLock: jest
          .fn()
          .mockResolvedValue({ status: TrainingLockStatus.RELEASED }),
      } as never,
      {} as never,
      { record: jest.fn() },
      { publish },
    );
  });

  it('captures the owner at lock time in the lock set event', async () => {
    await service.setLock(vet, 'h1', { reason: 'Nghỉ' });
    expect(publish).toHaveBeenCalledWith(
      expect.anything(),
      MEDICAL_TRAINING_LOCK_SET_EVENT,
      expect.objectContaining({ horseId: 'h1', ownerId: 'owner-a' }),
    );
  });

  it('captures the owner at release time in the lock released event', async () => {
    await service.releaseLock(vet, 'l1', { conclusion: 'Ổn' });
    expect(publish).toHaveBeenCalledWith(
      expect.anything(),
      MEDICAL_TRAINING_LOCK_RELEASED_EVENT,
      expect.objectContaining({ horseId: 'h1', ownerId: 'owner-a' }),
    );
  });
});

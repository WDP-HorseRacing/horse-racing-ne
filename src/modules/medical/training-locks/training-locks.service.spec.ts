import { EntityManager } from 'typeorm';
import { TrainingLockStatus } from '../constants/training-lock.enum';
import { TrainingLockEntity } from '../entities/training-lock.entity';
import { TrainingLockService } from './training-locks.service';

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
    unused,
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

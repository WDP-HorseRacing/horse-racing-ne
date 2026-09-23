import { EntityManager, Repository } from 'typeorm';
import { RaceStatus } from '../constants/race-status.enum';
import { RegistrationStatus } from '../constants/registration-status.enum';
import { RaceRegistrationEntity } from '../entities/race-registration.entity';
import { RacingRepository } from './racing.repository';

function buildManager(affected: number | undefined) {
  const qb = {
    update: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    execute: jest
      .fn()
      .mockResolvedValue({ affected, raw: [], generatedMaps: [] }),
  };
  const createQueryBuilder = jest.fn(() => qb);
  const manager = { createQueryBuilder } as unknown as EntityManager;
  return { qb, manager, createQueryBuilder };
}

describe('RacingRepository.withdrawOpenRegistrationsByHorse', () => {
  const injectedCreateQueryBuilder = jest.fn();
  const injected = {
    createQueryBuilder: injectedCreateQueryBuilder,
  } as unknown as Repository<RaceRegistrationEntity>;
  const repository = new RacingRepository(injected);

  it('updates open registrations of upcoming races to WITHDRAWN through the given manager', async () => {
    const { qb, manager, createQueryBuilder } = buildManager(2);

    const count = await repository.withdrawOpenRegistrationsByHorse(
      manager,
      'h1',
    );

    expect(count).toBe(2);
    expect(createQueryBuilder).toHaveBeenCalledTimes(1);
    expect(injectedCreateQueryBuilder).not.toHaveBeenCalled();
    expect(qb.update).toHaveBeenCalledWith(RaceRegistrationEntity);
    expect(qb.set).toHaveBeenCalledWith({
      status: RegistrationStatus.WITHDRAWN,
    });
    expect(qb.where).toHaveBeenCalledWith('horse_id = :horseId', {
      horseId: 'h1',
    });
    expect(qb.andWhere).toHaveBeenCalledWith('status IN (:...open)', {
      open: [
        RegistrationStatus.PROPOSED,
        RegistrationStatus.OWNER_APPROVED,
        RegistrationStatus.MANAGER_CONFIRMED,
      ],
    });
    expect(qb.andWhere).toHaveBeenCalledWith(
      'race_id IN (SELECT id FROM races WHERE status IN (:...upcoming))',
      { upcoming: [RaceStatus.PLANNED, RaceStatus.OPEN] },
    );
    expect(qb.execute).toHaveBeenCalledTimes(1);
  });

  it('returns 0 when nothing was withdrawn', async () => {
    const { manager } = buildManager(0);

    await expect(
      repository.withdrawOpenRegistrationsByHorse(manager, 'h1'),
    ).resolves.toBe(0);
  });

  it('returns 0 when the driver does not report affected rows', async () => {
    const { manager } = buildManager(undefined);

    await expect(
      repository.withdrawOpenRegistrationsByHorse(manager, 'h1'),
    ).resolves.toBe(0);
  });
});

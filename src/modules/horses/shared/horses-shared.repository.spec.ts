import { DataSource, IsNull, Repository } from 'typeorm';
import { HorseEntity } from '../entities/horse.entity';
import { HorsesSharedRepository } from './horses-shared.repository';

type QueryBuilderMock = Record<string, jest.Mock>;

function queryBuilderMock(): QueryBuilderMock {
  const qb: QueryBuilderMock = {};
  for (const method of ['where', 'andWhere']) {
    qb[method] = jest.fn().mockReturnValue(qb);
  }
  qb.getCount = jest.fn().mockResolvedValue(0);
  return qb;
}

describe('HorsesSharedRepository.isVisible', () => {
  function repositoryWith(qb: QueryBuilderMock): HorsesSharedRepository {
    return new HorsesSharedRepository(
      {
        createQueryBuilder: jest.fn().mockReturnValue(qb),
      } as unknown as Repository<HorseEntity>,
      {} as DataSource,
    );
  }

  it('limits a horse owner to the horses they currently own', async () => {
    const qb = queryBuilderMock();
    qb.getCount = jest.fn().mockResolvedValue(1);
    await repositoryWith(qb).isVisible('h1', {
      kind: 'OWNER',
      userId: 'owner-1',
    });
    expect(qb.andWhere).toHaveBeenCalledWith(
      'EXISTS (SELECT 1 FROM horse_ownerships ho WHERE ho.horse_id = horse.id AND ho.owner_id = :scopeUserId AND ho.end_at IS NULL)',
      { scopeUserId: 'owner-1' },
    );
  });

  it('shows every horse for the ALL scope without querying', async () => {
    const qb = queryBuilderMock();
    await expect(
      repositoryWith(qb).isVisible('h1', { kind: 'ALL' }),
    ).resolves.toBe(true);
    expect(qb.where).not.toHaveBeenCalled();
  });
});

describe('HorsesSharedRepository.isGroomAssigned', () => {
  it('checks only the open groom assignment of the horse', async () => {
    const existsBy = jest.fn().mockResolvedValue(true);
    const repository = new HorsesSharedRepository(
      {} as Repository<HorseEntity>,
      {
        getRepository: jest.fn().mockReturnValue({ existsBy }),
      } as unknown as DataSource,
    );
    await repository.isGroomAssigned('h1', 'groom-1');
    expect(existsBy).toHaveBeenCalledWith({
      horseId: 'h1',
      groomId: 'groom-1',
      endAt: IsNull(),
    });
  });
});

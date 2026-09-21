import { DataSource, EntityManager, IsNull, Not, Repository } from 'typeorm';
import { SortOrder } from '../../../common/enums/sort-order.enum';
import { TrainingLockStatus } from '../../medical/constants/training-lock.enum';
import { HORSE_BUSINESS_TABLES } from '../enums/horse.constants';
import { HorseListSortBy } from '../enums/horse-list-sort.enum';
import { HorseListQueryDto } from '../dto/horse.dto';
import { HorseMeasurementEntity } from '../entities/horse-measurement.entity';
import { HorseOwnershipEntity } from '../entities/horse-ownership.entity';
import { HorseEntity } from '../entities/horse.entity';
import { HorseProfilesRepository } from './horse-profiles.repository';

type QueryBuilderMock = Record<string, jest.Mock>;

const NAME_ORDER = 'horse.name COLLATE "vi-x-icu"';

function queryBuilderMock(): QueryBuilderMock {
  const qb: QueryBuilderMock = {};
  for (const method of [
    'where',
    'andWhere',
    'withDeleted',
    'addSelect',
    'orderBy',
    'addOrderBy',
    'skip',
    'take',
  ]) {
    qb[method] = jest.fn().mockReturnValue(qb);
  }
  qb.getManyAndCount = jest.fn().mockResolvedValue([[], 0]);
  return qb;
}

function orderCalls(qb: QueryBuilderMock): unknown[][] {
  return [qb.orderBy, qb.addOrderBy].flatMap(
    (mock) => mock.mock.calls as unknown[][],
  );
}

describe('HorseProfilesRepository.list ordering', () => {
  let qb: QueryBuilderMock;
  let repository: HorseProfilesRepository;

  beforeEach(() => {
    qb = queryBuilderMock();
    const horses = { createQueryBuilder: jest.fn().mockReturnValue(qb) };
    repository = new HorseProfilesRepository(
      horses as unknown as Repository<HorseEntity>,
      {} as Repository<HorseOwnershipEntity>,
      {} as Repository<HorseMeasurementEntity>,
      {} as DataSource,
    );
  });

  it('sorts by name A to Z by default', async () => {
    await repository.list({ kind: 'ALL' }, new HorseListQueryDto());
    expect(orderCalls(qb)).toEqual([[NAME_ORDER, SortOrder.ASC]]);
  });

  it('sorts by name Z to A when asked', async () => {
    const query = Object.assign(new HorseListQueryDto(), {
      sortOrder: SortOrder.DESC,
    });
    await repository.list({ kind: 'ALL' }, query);
    expect(orderCalls(qb)).toEqual([[NAME_ORDER, SortOrder.DESC]]);
  });

  it.each([SortOrder.ASC, SortOrder.DESC])(
    'sorts by health priority %s, then by name A to Z',
    async (sortOrder) => {
      const query = Object.assign(new HorseListQueryDto(), {
        sortBy: HorseListSortBy.HEALTH_PRIORITY,
        sortOrder,
      });
      await repository.list({ kind: 'ALL' }, query);
      expect(orderCalls(qb)).toEqual([
        ['health_priority', sortOrder],
        [NAME_ORDER, SortOrder.ASC],
      ]);
    },
  );

  it('matches the name without Vietnamese accents and the microchip as typed', async () => {
    const query = Object.assign(new HorseListQueryDto(), {
      search: 'dai bang',
    });
    await repository.list({ kind: 'ALL' }, query);
    expect(qb.andWhere).toHaveBeenCalledWith(
      '(unaccent(horse.name) ILIKE unaccent(:search) OR horse.microchipId ILIKE :search)',
      { search: '%dai bang%' },
    );
  });

  it('ranks injured and quarantined first, then under observation, then eligible', async () => {
    const query = Object.assign(new HorseListQueryDto(), {
      sortBy: HorseListSortBy.HEALTH_PRIORITY,
    });
    await repository.list({ kind: 'ALL' }, query);
    const [expression] = qb.addSelect.mock.calls[0] as [string];
    expect(expression).toContain("WHEN 'INJURED' THEN 0");
    expect(expression).toContain("WHEN 'QUARANTINED' THEN 0");
    expect(expression).toContain("WHEN 'UNDER_OBSERVATION' THEN 1");
    expect(expression).toContain('ELSE 2');
  });
});

describe('HorseProfilesRepository list enrichment queries', () => {
  let dataSource: { query: jest.Mock };
  let repository: HorseProfilesRepository;

  beforeEach(() => {
    dataSource = { query: jest.fn().mockResolvedValue([]) };
    repository = new HorseProfilesRepository(
      {} as Repository<HorseEntity>,
      {} as Repository<HorseOwnershipEntity>,
      {} as Repository<HorseMeasurementEntity>,
      dataSource as unknown as DataSource,
    );
  });

  it('skips the stall query when no horse ids are given', async () => {
    await expect(repository.currentStallsByHorseIds([])).resolves.toEqual([]);
    expect(dataSource.query).not.toHaveBeenCalled();
  });

  it('returns the current stall rows for the given horses', async () => {
    const row = {
      horseId: 'horse-1',
      stallId: 'stall-1',
      stallCode: 'A-01',
      barnId: 'barn-1',
      barnName: 'Barn A',
    };
    dataSource.query.mockResolvedValue([row]);
    await expect(
      repository.currentStallsByHorseIds(['horse-1', 'horse-2']),
    ).resolves.toEqual([row]);
    expect(dataSource.query).toHaveBeenCalledWith(expect.any(String), [
      ['horse-1', 'horse-2'],
    ]);
  });

  it('skips the training lock query when no horse ids are given', async () => {
    await expect(repository.activeTrainingLockHorseIds([])).resolves.toEqual(
      new Set(),
    );
    expect(dataSource.query).not.toHaveBeenCalled();
  });

  it('returns the ids of horses with an active training lock', async () => {
    dataSource.query.mockResolvedValue([{ horse_id: 'horse-2' }]);
    await expect(
      repository.activeTrainingLockHorseIds(['horse-1', 'horse-2']),
    ).resolves.toEqual(new Set(['horse-2']));
    expect(dataSource.query).toHaveBeenCalledWith(expect.any(String), [
      ['horse-1', 'horse-2'],
      TrainingLockStatus.ACTIVE,
    ]);
  });
});

describe('HorseProfilesRepository groom and owner lookups', () => {
  let groomAssignments: { existsBy: jest.Mock; findOne: jest.Mock };
  let ownerships: { findOne: jest.Mock };
  let repository: HorseProfilesRepository;

  beforeEach(() => {
    groomAssignments = {
      existsBy: jest.fn().mockResolvedValue(true),
      findOne: jest.fn().mockResolvedValue(null),
    };
    ownerships = { findOne: jest.fn().mockResolvedValue(null) };
    repository = new HorseProfilesRepository(
      {} as Repository<HorseEntity>,
      ownerships as unknown as Repository<HorseOwnershipEntity>,
      {} as Repository<HorseMeasurementEntity>,
      {
        getRepository: jest.fn().mockReturnValue(groomAssignments),
      } as unknown as DataSource,
    );
  });

  it('returns the current groom with their name', async () => {
    groomAssignments.findOne.mockResolvedValue({
      groom: { id: 'groom-1', fullName: 'Trần B' },
    });
    await expect(repository.currentGroom('h1')).resolves.toEqual({
      id: 'groom-1',
      fullName: 'Trần B',
    });
  });

  it('returns null when the horse has no representative owner', async () => {
    await expect(repository.representativeOwner('h1')).resolves.toBeNull();
    expect(ownerships.findOne).toHaveBeenCalledWith({
      where: { horseId: 'h1', endAt: IsNull(), isRepresentative: true },
      relations: { owner: true },
    });
  });
});

describe('HorseProfilesRepository.microchipTaken', () => {
  let exists: jest.Mock;
  let repository: HorseProfilesRepository;

  beforeEach(() => {
    exists = jest.fn().mockResolvedValue(true);
    repository = new HorseProfilesRepository(
      { exists } as unknown as Repository<HorseEntity>,
      {} as Repository<HorseOwnershipEntity>,
      {} as Repository<HorseMeasurementEntity>,
      {} as DataSource,
    );
  });

  it('also looks at soft-deleted horses', async () => {
    await repository.microchipTaken('985000000000001');
    expect(exists).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { microchipId: '985000000000001' },
        withDeleted: true,
      }),
    );
  });
});

describe('HorseProfilesRepository.earliestChildBirthDate', () => {
  let findOne: jest.Mock;
  let repository: HorseProfilesRepository;

  beforeEach(() => {
    findOne = jest.fn().mockResolvedValue({ dateOfBirth: '2020-05-01' });
    repository = new HorseProfilesRepository(
      { findOne } as unknown as Repository<HorseEntity>,
      {} as Repository<HorseOwnershipEntity>,
      {} as Repository<HorseMeasurementEntity>,
      {} as DataSource,
    );
  });

  it('takes the oldest dated child as sire or dam', async () => {
    await expect(repository.earliestChildBirthDate('h1')).resolves.toBe(
      '2020-05-01',
    );
    expect(findOne).toHaveBeenCalledWith(
      expect.objectContaining({
        where: [
          { sireId: 'h1', dateOfBirth: Not(IsNull()) },
          { damId: 'h1', dateOfBirth: Not(IsNull()) },
        ],
        order: { dateOfBirth: 'ASC' },
      }),
    );
  });

  it('returns null when no child has a date of birth', async () => {
    findOne.mockResolvedValue(null);
    await expect(repository.earliestChildBirthDate('h1')).resolves.toBeNull();
  });
});

describe('HorseProfilesRepository.hasBusinessData', () => {
  const repository = new HorseProfilesRepository(
    {} as Repository<HorseEntity>,
    {} as Repository<HorseOwnershipEntity>,
    {} as Repository<HorseMeasurementEntity>,
    {} as DataSource,
  );

  it('checks every business table in one query through the transaction manager', async () => {
    const query = jest.fn().mockResolvedValue([{ exists: false }]);
    const manager = { query } as unknown as EntityManager;

    await expect(repository.hasBusinessData('h1', manager)).resolves.toBe(
      false,
    );

    expect(query).toHaveBeenCalledTimes(1);
    const [sql, params] = query.mock.calls[0] as [string, unknown[]];
    for (const table of HORSE_BUSINESS_TABLES) {
      expect(sql).toContain(`FROM ${table} WHERE horse_id = $1`);
    }
    expect(params).toEqual(['h1']);
  });

  it('returns true when any row exists', async () => {
    const manager = {
      query: jest.fn().mockResolvedValue([{ exists: true }]),
    } as unknown as EntityManager;
    await expect(repository.hasBusinessData('h1', manager)).resolves.toBe(true);
  });
});

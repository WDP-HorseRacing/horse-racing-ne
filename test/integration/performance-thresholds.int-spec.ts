import { ForbiddenException, RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { DataSource } from 'typeorm';
import { UserRole } from '../../src/common/enums/role.enum';
import type { Actor } from '../../src/common/types/actor';
import { HorseAccessService } from '../../src/modules/horses/shared/horse-access.service';
import { PerformanceThresholdsController } from '../../src/modules/performance/performance-thresholds/performance-thresholds.controller';
import { PerformanceThresholdsService } from '../../src/modules/performance/performance-thresholds/performance-thresholds.service';
import { fixtures } from './fixtures';
import {
  startTestPostgres,
  stopTestPostgres,
  truncateAllTables,
  type TestPostgres,
} from './postgres';

describe('PerformanceThresholdsService (Postgres)', () => {
  let db: TestPostgres;
  let dataSource: DataSource;
  let seed: ReturnType<typeof fixtures>;
  let service: PerformanceThresholdsService;

  beforeAll(async () => {
    db = await startTestPostgres();
    dataSource = db.dataSource;
    seed = fixtures(dataSource);
    service = new PerformanceThresholdsService(
      new HorseAccessService(dataSource),
      dataSource,
    );
  });

  afterAll(() => stopTestPostgres(db));

  beforeEach(() => truncateAllTables(dataSource));

  const actorOf = async (
    role: UserRole,
  ): Promise<{ id: string; actor: Actor }> => {
    const id = await seed.user(role);
    const [row] = await dataSource.query<Array<{ keycloak_id: string }>>(
      'SELECT keycloak_id FROM users WHERE id = $1',
      [id],
    );
    return { id, actor: { sub: row.keycloak_id, roles: [role] } };
  };

  const horseInBarnOf = async (trainerId: string): Promise<string> => {
    const barnId = await seed.barn('Khu A');
    await dataSource.query(
      'UPDATE barns SET head_trainer_id = $1 WHERE id = $2',
      [trainerId, barnId],
    );
    return seed.horse('Winx', { barnId });
  };

  it('returns the club thresholds for any horse', async () => {
    const manager = await actorOf(UserRole.CLUB_MANAGER);
    const horseId = await seed.horse('Winx');

    const result = await service.list(manager.actor, horseId);

    expect(result).toEqual({
      horseId,
      limits: {
        heartRateWarningBpm: 220,
        heartRateCriticalBpm: 240,
        maxSpeedMps: 18,
      },
    });
  });

  it('lets the head trainer of the barn read the thresholds', async () => {
    const trainer = await actorOf(UserRole.HEAD_TRAINER);
    const horseId = await horseInBarnOf(trainer.id);

    const result = await service.list(trainer.actor, horseId);

    expect(result.horseId).toBe(horseId);
  });

  it('forbids a head trainer outside the barn from reading thresholds', async () => {
    const owner = await actorOf(UserRole.HEAD_TRAINER);
    const other = await actorOf(UserRole.HEAD_TRAINER);
    const horseId = await horseInBarnOf(owner.id);

    await expect(service.list(other.actor, horseId)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('exposes only a read route for thresholds', () => {
    const prototype =
      PerformanceThresholdsController.prototype as unknown as Record<
        string,
        object
      >;
    const routes = Object.getOwnPropertyNames(prototype)
      .filter((name) => name !== 'constructor')
      .map((name) => [
        Reflect.getMetadata(METHOD_METADATA, prototype[name]) as RequestMethod,
        Reflect.getMetadata(PATH_METADATA, prototype[name]) as string,
      ]);

    expect(routes).toEqual([[RequestMethod.GET, 'horses/:id/thresholds']]);
  });
});

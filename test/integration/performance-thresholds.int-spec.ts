import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { UserRole } from '../../src/common/enums/role.enum';
import type { Actor } from '../../src/common/types/actor';
import { HorseLifecycleStatus } from '../../src/modules/horses/enums/horse-status.enum';
import { HorseAccessService } from '../../src/modules/horses/shared/horse-access.service';
import { PerformanceThresholdEntity } from '../../src/modules/performance/entities/performance-threshold.entity';
import { ThresholdSource } from '../../src/modules/performance/enums/threshold-source.enum';
import { PerformanceThresholdsService } from '../../src/modules/performance/performance-thresholds/performance-thresholds.service';
import { PerformanceAccessService } from '../../src/modules/performance/shared/performance-access.service';
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

  const limits = {
    heartRateWarningBpm: 210,
    heartRateCriticalBpm: 235,
    maxSpeedMps: 17,
  };

  beforeAll(async () => {
    db = await startTestPostgres();
    dataSource = db.dataSource;
    seed = fixtures(dataSource);
    service = new PerformanceThresholdsService(
      dataSource.getRepository(PerformanceThresholdEntity),
      new HorseAccessService(dataSource),
      new PerformanceAccessService(dataSource),
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

  const horseInBarnOf = async (
    trainerId: string,
    lifecycle?: HorseLifecycleStatus,
  ): Promise<string> => {
    const barnId = await seed.barn('Khu A');
    await dataSource.query(
      'UPDATE barns SET head_trainer_id = $1 WHERE id = $2',
      [trainerId, barnId],
    );
    return seed.horse('Winx', { barnId, lifecycle });
  };

  it('falls back to the club default when the horse has no profile', async () => {
    const manager = await actorOf(UserRole.CLUB_MANAGER);
    const horseId = await seed.horse('Winx');

    const result = await service.list(manager.actor, horseId);

    expect(result.source).toBe(ThresholdSource.CLUB_DEFAULT);
    expect(result.activeLimits).toEqual({
      heartRateWarningBpm: 220,
      heartRateCriticalBpm: 240,
      maxSpeedMps: 18,
    });
    expect(result.profiles).toEqual([]);
  });

  it('adds a new version on each upsert and applies the newest one in effect', async () => {
    const trainer = await actorOf(UserRole.HEAD_TRAINER);
    const horseId = await horseInBarnOf(trainer.id);

    await service.upsert(trainer.actor, horseId, {
      profileName: 'Nền',
      effectiveFrom: '2026-01-01T00:00:00Z',
      limits,
    });
    const second = await service.upsert(trainer.actor, horseId, {
      profileName: 'Tăng tốc',
      effectiveFrom: '2026-02-01T00:00:00Z',
      limits: { ...limits, maxSpeedMps: 19 },
    });
    await service.upsert(trainer.actor, horseId, {
      profileName: 'Tương lai',
      effectiveFrom: '2099-01-01T00:00:00Z',
      limits: { ...limits, maxSpeedMps: 20 },
    });

    const result = await service.list(trainer.actor, horseId);

    expect(second.ruleVersion).toBe(2);
    expect(result.source).toBe(ThresholdSource.HORSE);
    expect(result.activeLimits).toEqual({ ...limits, maxSpeedMps: 19 });
    expect(result.profiles.map((p) => p.ruleVersion)).toEqual([3, 2, 1]);
  });

  it('forbids a head trainer outside the barn from reading or setting thresholds', async () => {
    const owner = await actorOf(UserRole.HEAD_TRAINER);
    const other = await actorOf(UserRole.HEAD_TRAINER);
    const horseId = await horseInBarnOf(owner.id);

    await expect(service.list(other.actor, horseId)).rejects.toThrow(
      ForbiddenException,
    );
    await expect(
      service.upsert(other.actor, horseId, {
        profileName: 'Nền',
        effectiveFrom: '2026-01-01T00:00:00Z',
        limits,
      }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('rejects a warning heart rate that is not below the critical one', async () => {
    const trainer = await actorOf(UserRole.HEAD_TRAINER);
    const horseId = await horseInBarnOf(trainer.id);

    await expect(
      service.upsert(trainer.actor, horseId, {
        profileName: 'Sai',
        effectiveFrom: '2026-01-01T00:00:00Z',
        limits: { ...limits, heartRateWarningBpm: 235 },
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects setting thresholds for a transferred horse', async () => {
    const trainer = await actorOf(UserRole.HEAD_TRAINER);
    const horseId = await horseInBarnOf(
      trainer.id,
      HorseLifecycleStatus.TRANSFERRED,
    );

    await expect(
      service.upsert(trainer.actor, horseId, {
        profileName: 'Nền',
        effectiveFrom: '2026-01-01T00:00:00Z',
        limits,
      }),
    ).rejects.toThrow(ConflictException);
  });

  it('forbids the club manager from setting thresholds', async () => {
    const manager = await actorOf(UserRole.CLUB_MANAGER);
    const horseId = await seed.horse('Winx');

    await expect(
      service.upsert(manager.actor, horseId, {
        profileName: 'Nền',
        effectiveFrom: '2026-01-01T00:00:00Z',
        limits,
      }),
    ).rejects.toThrow(ForbiddenException);
  });
});

import { NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { UserRole } from '../../src/common/enums/role.enum';
import type { Actor } from '../../src/common/types/actor';
import { HorseEntity } from '../../src/modules/horses/entities/horse.entity';
import { HorseLifecycleStatus } from '../../src/modules/horses/enums/horse-status.enum';
import { HorseProfilesRepository } from '../../src/modules/horses/horse-profiles/horse-profiles.repository';
import { PastHorsesService } from '../../src/modules/horses/horse-profiles/past-horses.service';
import { HorseAccessService } from '../../src/modules/horses/shared/horse-access.service';
import type { MediaService } from '../../src/modules/media/services/media.service';
import { fixtures } from './fixtures';
import {
  startTestPostgres,
  stopTestPostgres,
  truncateAllTables,
  type TestPostgres,
} from './postgres';

describe('Past horses of an owner (Postgres)', () => {
  let db: TestPostgres;
  let dataSource: DataSource;
  let seed: ReturnType<typeof fixtures>;
  let service: PastHorsesService;

  beforeAll(async () => {
    db = await startTestPostgres();
    dataSource = db.dataSource;
    seed = fixtures(dataSource);
    service = new PastHorsesService(
      new HorseProfilesRepository(
        dataSource.getRepository(HorseEntity),
        dataSource,
      ),
      new HorseAccessService(dataSource),
      {
        signDownloadUrls: (ids: string[]) =>
          Promise.resolve(new Map(ids.map((id) => [id, `url:${id}`]))),
      } as unknown as MediaService,
    );
  });

  afterAll(() => stopTestPostgres(db));

  beforeEach(() => truncateAllTables(dataSource));

  const actorOf = async (id: string): Promise<Actor> => {
    const [row] = await dataSource.query<Array<{ keycloak_id: string }>>(
      'SELECT keycloak_id FROM users WHERE id = $1',
      [id],
    );
    return { sub: row.keycloak_id, roles: [UserRole.HORSE_OWNER] };
  };

  it('lists the horses an owner sold, inside or outside the club, with each period, and shows one with its pedigree names', async () => {
    const a = await seed.user(UserRole.HORSE_OWNER);
    const b = await seed.user(UserRole.HORSE_OWNER);
    const sire = await seed.horse('Cha Gió');
    const internal = await seed.horse('Bán trong CLB', { ownerId: b });
    await dataSource.query(
      `UPDATE horses SET sire_id = $1, color = 'Bay' WHERE id = $2`,
      [sire, internal],
    );
    await seed.ownership(
      internal,
      a,
      '2026-01-01T00:00:00Z',
      '2026-03-01T00:00:00Z',
    );
    await seed.ownership(internal, b, '2026-03-01T00:00:00Z');
    const outside = await seed.horse('Bán ra ngoài', {
      lifecycle: HorseLifecycleStatus.TRANSFERRED,
    });
    await seed.ownership(
      outside,
      a,
      '2026-02-01T00:00:00Z',
      '2026-05-01T00:00:00Z',
    );
    const rebought = await seed.horse('Mua lại', { ownerId: a });
    await seed.ownership(
      rebought,
      a,
      '2026-01-01T00:00:00Z',
      '2026-02-01T00:00:00Z',
    );
    await seed.ownership(rebought, a, '2026-04-01T00:00:00Z');
    const deleted = await seed.horse('Đã xóa', { deleted: true });
    await seed.ownership(
      deleted,
      a,
      '2026-01-01T00:00:00Z',
      '2026-02-01T00:00:00Z',
    );

    const list = await service.list(await actorOf(a));

    expect(list).toEqual([
      {
        horseId: outside,
        name: 'Bán ra ngoài',
        photoUrl: null,
        periods: [
          {
            startedAt: new Date('2026-02-01T00:00:00Z'),
            endedAt: new Date('2026-05-01T00:00:00Z'),
          },
        ],
      },
      {
        horseId: internal,
        name: 'Bán trong CLB',
        photoUrl: null,
        periods: [
          {
            startedAt: new Date('2026-01-01T00:00:00Z'),
            endedAt: new Date('2026-03-01T00:00:00Z'),
          },
        ],
      },
    ]);
    await expect(service.list(await actorOf(b))).resolves.toEqual([]);

    const detail = await service.detail(await actorOf(a), internal);
    expect(detail).toMatchObject({
      horseId: internal,
      name: 'Bán trong CLB',
      color: 'Bay',
      ancestors: [expect.objectContaining({ name: 'Cha Gió', canOpen: false })],
    });
    expect(detail.ancestors[0]).not.toHaveProperty('gender');
    expect(detail).not.toHaveProperty('ownerId');
  });

  it('hides a horse from its current owner, a stranger and after deletion', async () => {
    const a = await seed.user(UserRole.HORSE_OWNER);
    const b = await seed.user(UserRole.HORSE_OWNER);
    const stranger = await seed.user(UserRole.HORSE_OWNER);
    const horse = await seed.horse('Winx', { ownerId: b });
    await seed.ownership(
      horse,
      a,
      '2026-01-01T00:00:00Z',
      '2026-03-01T00:00:00Z',
    );
    await seed.ownership(horse, b, '2026-03-01T00:00:00Z');

    for (const owner of [b, stranger]) {
      await expect(
        service.detail(await actorOf(owner), horse),
      ).rejects.toBeInstanceOf(NotFoundException);
    }
    await dataSource.query(
      'UPDATE horses SET deleted_at = now() WHERE id = $1',
      [horse],
    );
    await expect(
      service.detail(await actorOf(a), horse),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

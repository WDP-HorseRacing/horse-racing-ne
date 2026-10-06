import { DataSource, QueryFailedError } from 'typeorm';
import { UserRole } from '../../src/common/enums/role.enum';
import { HorseOwnershipService } from '../../src/modules/horses/shared/horse-ownership.service';
import { fixtures } from './fixtures';
import {
  startTestPostgres,
  stopTestPostgres,
  truncateAllTables,
  type TestPostgres,
} from './postgres';

interface OwnershipRow {
  owner_id: string;
  effective_date: string;
  started_at: Date;
  ended_at: Date | null;
  reason: string | null;
  recorded_by: string | null;
}

describe('HorseOwnershipService (Postgres)', () => {
  let db: TestPostgres;
  let dataSource: DataSource;
  let ownerships: HorseOwnershipService;
  let seed: ReturnType<typeof fixtures>;

  const periods = (horseId: string): Promise<OwnershipRow[]> =>
    dataSource.query(
      `SELECT owner_id, to_char(effective_date, 'YYYY-MM-DD') AS effective_date,
              started_at, ended_at, reason, recorded_by
         FROM horse_ownerships WHERE horse_id = $1 ORDER BY started_at`,
      [horseId],
    );

  beforeAll(async () => {
    db = await startTestPostgres();
    dataSource = db.dataSource;
    ownerships = new HorseOwnershipService();
    seed = fixtures(dataSource);
  });

  afterAll(() => stopTestPostgres(db));

  beforeEach(() => truncateAllTables(dataSource));

  it('closes the open period and opens the next one at the same instant', async () => {
    const a = await seed.user(UserRole.HORSE_OWNER);
    const b = await seed.user(UserRole.HORSE_OWNER);
    const cm = await seed.user(UserRole.CLUB_MANAGER);
    const horse = await seed.horse('Winx', { ownerId: a });
    const first = new Date('2026-03-01T03:00:00Z');
    const second = new Date('2026-06-01T03:00:00Z');

    await dataSource.transaction(async (m) => {
      await ownerships.recordOwnerChange(m, {
        horseId: horse,
        ownerId: a,
        at: first,
        recordedBy: cm,
      });
      await ownerships.recordOwnerChange(m, {
        horseId: horse,
        ownerId: b,
        at: second,
        effectiveDate: '2026-05-30',
        reason: 'HĐ 12',
        recordedBy: cm,
      });
    });

    expect(await periods(horse)).toEqual([
      {
        owner_id: a,
        effective_date: '2026-03-01',
        started_at: first,
        ended_at: second,
        reason: null,
        recorded_by: cm,
      },
      {
        owner_id: b,
        effective_date: '2026-05-30',
        started_at: second,
        ended_at: null,
        reason: 'HĐ 12',
        recorded_by: cm,
      },
    ]);
    await expect(
      ownerships.currentOwnerSince(dataSource.manager, horse),
    ).resolves.toBe('2026-05-30');
  });

  it('only closes the period when the owner is cleared', async () => {
    const a = await seed.user(UserRole.HORSE_OWNER);
    const horse = await seed.horse('Winx', { ownerId: a });
    const at = new Date('2026-03-01T03:00:00Z');
    await ownerships.recordOwnerChange(dataSource.manager, {
      horseId: horse,
      ownerId: a,
      at,
      recordedBy: null,
    });

    await ownerships.recordOwnerChange(dataSource.manager, {
      horseId: horse,
      ownerId: null,
      at: new Date('2026-04-01T03:00:00Z'),
      recordedBy: null,
    });

    const rows = await periods(horse);
    expect(rows).toHaveLength(1);
    expect(rows[0].ended_at).toEqual(new Date('2026-04-01T03:00:00Z'));
    await expect(
      ownerships.currentOwnerSince(dataSource.manager, horse),
    ).resolves.toBeNull();
  });

  it('refuses a second open period for the same horse', async () => {
    const a = await seed.user(UserRole.HORSE_OWNER);
    const horse = await seed.horse('Winx', { ownerId: a });
    const insertOpen = () =>
      dataSource.query(
        `INSERT INTO horse_ownerships (horse_id, owner_id, effective_date, started_at, version)
         VALUES ($1, $2, '2026-01-01', now(), 1)`,
        [horse, a],
      );
    await insertOpen();

    await expect(insertOpen()).rejects.toThrow(QueryFailedError);
  });

  it('backfills one open period per owned horse from its creation time', async () => {
    const a = await seed.user(UserRole.HORSE_OWNER);
    const owned = await seed.horse('Có chủ', {
      ownerId: a,
      createdAt: '2026-01-01T18:00:00Z',
    });
    await seed.horse('Không chủ');
    await dataSource.query('DELETE FROM horse_ownerships');
    const migration = dataSource.migrations.find(
      (item) => item.name === 'CreateHorseOwnerships1789824400000',
    );
    const runner = dataSource.createQueryRunner();
    await migration!.down(runner);
    await migration!.up(runner);
    await runner.release();

    const rows: { horse_id: string }[] = await dataSource.query(
      'SELECT horse_id FROM horse_ownerships',
    );
    expect(rows).toEqual([{ horse_id: owned }]);
    expect(await periods(owned)).toEqual([
      expect.objectContaining({
        owner_id: a,
        effective_date: '2026-01-02',
        started_at: new Date('2026-01-01T18:00:00Z'),
        ended_at: null,
        recorded_by: null,
      }),
    ]);
  });
});

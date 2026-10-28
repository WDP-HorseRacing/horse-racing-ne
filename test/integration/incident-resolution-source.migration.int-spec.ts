import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { UserRole } from '../../src/common/enums/role.enum';
import { IncidentResolutionSource1789830150000 } from '../../src/migrations/1789830150000-IncidentResolutionSource';
import { fixtures } from './fixtures';
import {
  startTestPostgres,
  stopTestPostgres,
  truncateAllTables,
  type TestPostgres,
} from './postgres';

describe('IncidentResolutionSource migration (Postgres)', () => {
  let db: TestPostgres;
  let dataSource: DataSource;
  let seed: ReturnType<typeof fixtures>;
  const migration = new IncidentResolutionSource1789830150000();

  beforeAll(async () => {
    db = await startTestPostgres();
    dataSource = db.dataSource;
    seed = fixtures(dataSource);
  });

  afterAll(() => stopTestPostgres(db));

  beforeEach(() => truncateAllTables(dataSource));

  const sourceColumn = async () =>
    dataSource.query<{ column_name: string }[]>(
      `SELECT column_name FROM information_schema.columns
        WHERE table_name = 'incidents' AND column_name = 'resolution_source'`,
    );

  it('fills the source of closed incidents on up, guards it against the status, and drops it on down', async () => {
    const runner = dataSource.createQueryRunner();
    try {
      const groom = await seed.user(UserRole.GROOM);
      const trainer = await seed.user(UserRole.HEAD_TRAINER);
      const horse = await seed.horse('Gió');
      const incident = async (status: string, resolvedBy: string | null) => {
        const id = randomUUID();
        await dataSource.query(
          `INSERT INTO incidents (id, version, horse_id, reported_by, description, status, resolution, resolved_by, resolved_at)
           VALUES ($1, 1, $2, $3, 'Mô tả', $4, $5, $6, $7)`,
          [
            id,
            horse,
            groom,
            status,
            status === 'OPEN' ? null : 'Xong',
            resolvedBy,
            status === 'OPEN' ? null : new Date(),
          ],
        );
        return id;
      };

      await migration.down(runner);
      expect(await sourceColumn()).toEqual([]);
      const rows = {
        open: await incident('OPEN', null),
        lifecycle: await incident('RESOLVED', null),
        byHand: await incident('RESOLVED', trainer),
      };

      await migration.up(runner);

      const sources = await dataSource.query<
        { id: string; resolution_source: string | null }[]
      >('SELECT id, resolution_source FROM incidents');
      expect(
        Object.fromEntries(
          Object.entries(rows).map(([key, id]) => [
            key,
            sources.find((row) => row.id === id)?.resolution_source,
          ]),
        ),
      ).toEqual({ open: null, lifecycle: 'LIFECYCLE', byHand: 'HEAD_TRAINER' });
      await expect(
        dataSource.query(
          `UPDATE incidents SET resolution_source = 'EXAM' WHERE id = $1`,
          [rows.open],
        ),
      ).rejects.toMatchObject({
        constraint: 'incidents_resolution_source_ck',
      });
      await expect(
        dataSource.query(
          `UPDATE incidents SET resolution_source = NULL WHERE id = $1`,
          [rows.byHand],
        ),
      ).rejects.toMatchObject({
        constraint: 'incidents_resolution_source_ck',
      });

      await migration.down(runner);
      expect(await sourceColumn()).toEqual([]);
      await migration.up(runner);
    } finally {
      await runner.release();
    }
  });
});

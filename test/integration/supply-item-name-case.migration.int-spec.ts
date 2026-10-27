import { DataSource } from 'typeorm';
import { SupplyItemNameCaseInsensitive1789830140000 } from '../../src/migrations/1789830140000-SupplyItemNameCaseInsensitive';
import {
  startTestPostgres,
  stopTestPostgres,
  truncateAllTables,
  type TestPostgres,
} from './postgres';

describe('SupplyItemNameCaseInsensitive migration (Postgres)', () => {
  let db: TestPostgres;
  let dataSource: DataSource;
  const migration = new SupplyItemNameCaseInsensitive1789830140000();

  beforeAll(async () => {
    db = await startTestPostgres();
    dataSource = db.dataSource;
  });

  afterAll(() => stopTestPostgres(db));

  beforeEach(() => truncateAllTables(dataSource));

  const insert = (name: string, deleted = false) =>
    dataSource.query(
      `INSERT INTO supply_items (version, name, category, unit, deleted_at)
       VALUES (1, $1, 'FEED', 'kg', $2)`,
      [name, deleted ? new Date() : null],
    );

  const indexDefinition = async () => {
    const [row] = await dataSource.query<{ indexdef: string }[]>(
      `SELECT indexdef FROM pg_indexes WHERE indexname = 'supply_items_name_uq'`,
    );
    return row?.indexdef;
  };

  it('makes the name unique regardless of case on up, and case sensitive again on down', async () => {
    const runner = dataSource.createQueryRunner();
    try {
      await insert('Cám A');
      await insert('cám a', true);
      await expect(insert('cám a')).rejects.toMatchObject({
        code: '23505',
        constraint: 'supply_items_name_uq',
      });

      await migration.down(runner);
      expect(await indexDefinition()).toContain('(name)');
      await insert('cám a');
      await dataSource.query(`DELETE FROM supply_items WHERE name = 'cám a'`);

      await migration.up(runner);
      expect(await indexDefinition()).toContain('lower((name)::text)');
      expect(await indexDefinition()).toContain('WHERE (deleted_at IS NULL)');
    } finally {
      await runner.release();
    }
  });

  it('stops with the clashing names instead of merging them', async () => {
    const runner = dataSource.createQueryRunner();
    try {
      await migration.down(runner);
      await insert('Cám A');
      await insert('cám a');
      await insert('Cỏ khô');
      await insert('CỎ KHÔ', true);

      await expect(migration.up(runner)).rejects.toThrow(
        'Tên vật tư trùng nhau khi không phân biệt hoa thường: "Cám A", "cám a". Đổi tên hoặc xóa bớt rồi chạy lại migration',
      );
      expect(await indexDefinition()).toContain('(name)');

      await dataSource.query(`DELETE FROM supply_items WHERE name = 'cám a'`);
      await migration.up(runner);
      expect(await indexDefinition()).toContain('lower((name)::text)');
    } finally {
      await runner.release();
    }
  });
});

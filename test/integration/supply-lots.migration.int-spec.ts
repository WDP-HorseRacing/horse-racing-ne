import { DataSource } from 'typeorm';
import {
  startTestPostgres,
  stopTestPostgres,
  truncateAllTables,
  type TestPostgres,
} from './postgres';
import { SupplyLots1789826600000 } from '../../src/migrations/1789826600000-SupplyLots';

describe('SupplyLots migration (Postgres)', () => {
  let db: TestPostgres;
  let dataSource: DataSource;
  const migration = new SupplyLots1789826600000();

  beforeAll(async () => {
    db = await startTestPostgres();
    dataSource = db.dataSource;
  });

  afterAll(() => stopTestPostgres(db));

  beforeEach(() => truncateAllTables(dataSource));

  it('turns the stock of each item into one opening lot priced 0, dated with the item', async () => {
    const runner = dataSource.createQueryRunner();
    await migration.down(runner);
    const [stocked] = await dataSource.query<Array<{ id: string }>>(
      `INSERT INTO supply_items (version, name, category, unit, quantity_on_hand, reorder_threshold, created_at)
       VALUES (1, 'Yến mạch', 'FEED', 'kg', 42.5, 10, '2026-09-01T00:00:00Z') RETURNING id`,
    );
    await dataSource.query(
      `INSERT INTO supply_items (version, name, category, unit, quantity_on_hand, reorder_threshold)
       VALUES (1, 'Cỏ khô', 'FEED', 'kg', 0, 10)`,
    );

    await migration.up(runner);
    await runner.release();

    const lots = await dataSource.query<
      Array<{
        item_id: string;
        quantity: string;
        remaining: string;
        unit_price: string;
        created_at: Date;
      }>
    >(
      'SELECT item_id, quantity, remaining, unit_price, created_at FROM supply_lots',
    );
    expect(lots).toEqual([
      {
        item_id: stocked.id,
        quantity: '42.50',
        remaining: '42.50',
        unit_price: '0',
        created_at: new Date('2026-09-01T00:00:00Z'),
      },
    ]);
  });
});

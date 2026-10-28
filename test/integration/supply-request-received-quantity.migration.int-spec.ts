import { DataSource } from 'typeorm';
import { UserRole } from '../../src/common/enums/role.enum';
import { SupplyRequestCancelReceivedQuantity1789828700000 } from '../../src/migrations/1789828700000-SupplyRequestCancelReceivedQuantity';
import { fixtures } from './fixtures';
import {
  startTestPostgres,
  stopTestPostgres,
  truncateAllTables,
  type TestPostgres,
} from './postgres';

describe('SupplyRequestCancelReceivedQuantity migration (Postgres)', () => {
  let db: TestPostgres;
  let dataSource: DataSource;
  let seed: ReturnType<typeof fixtures>;
  const migration = new SupplyRequestCancelReceivedQuantity1789828700000();

  beforeAll(async () => {
    db = await startTestPostgres();
    dataSource = db.dataSource;
    seed = fixtures(dataSource);
  });

  afterAll(() => stopTestPostgres(db));

  beforeEach(() => truncateAllTables(dataSource));

  const run = async (step: 'up' | 'down') => {
    const runner = dataSource.createQueryRunner();
    try {
      await migration[step](runner);
    } finally {
      await runner.release();
    }
  };

  const rows = () =>
    dataSource.query<
      Array<{ status: string; quantity: string | null; reason: string | null }>
    >(
      `SELECT status, quantity, rejection_reason AS reason
         FROM supply_requests ORDER BY note`,
    );

  it('matches the entity once all migrations ran', async () => {
    const sql = await dataSource.driver.createSchemaBuilder().log();

    expect(
      sql.upQueries
        .map((query) => query.query)
        .filter((query) => query.includes('supply_requests')),
    ).toEqual([]);
  });

  it('keeps the restocked quantity only on fulfilled requests and back', async () => {
    const groom = await seed.user(UserRole.GROOM);
    await run('down');
    const [{ id: itemId }] = await dataSource.query<Array<{ id: string }>>(
      `INSERT INTO supply_items (version, name, category, unit)
       VALUES (1, 'Cám', 'FEED', 'bao') RETURNING id`,
    );
    for (const [note, status] of [
      ['1', 'PENDING'],
      ['2', 'APPROVED'],
      ['3', 'REJECTED'],
      ['4', 'FULFILLED'],
    ]) {
      await dataSource.query(
        `INSERT INTO supply_requests (version, item_id, requested_by, quantity, status, note)
         VALUES (1, $1, $2, 50, $3, $4)`,
        [itemId, groom, status, note],
      );
    }

    await run('up');

    expect(await rows()).toEqual([
      { status: 'PENDING', quantity: null, reason: null },
      { status: 'APPROVED', quantity: null, reason: null },
      { status: 'REJECTED', quantity: null, reason: null },
      { status: 'FULFILLED', quantity: '50.00', reason: null },
    ]);

    await dataSource.query(
      `UPDATE supply_requests
          SET status = 'CANCELLED', cancelled_by = $1, cancelled_at = now(),
              cancellation_reason = 'Hết hàng'
        WHERE note = '2'`,
      [groom],
    );
    await run('down');

    expect(await rows()).toEqual([
      { status: 'PENDING', quantity: '1.00', reason: null },
      { status: 'REJECTED', quantity: '1.00', reason: 'Hết hàng' },
      { status: 'REJECTED', quantity: '1.00', reason: null },
      { status: 'FULFILLED', quantity: '50.00', reason: null },
    ]);
    await run('up');
  });
});

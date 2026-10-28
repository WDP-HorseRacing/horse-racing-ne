import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { HorseOwnerAuditFeature1789829900000 } from '../../src/migrations/1789829900000-HorseOwnerAuditFeature';
import {
  startTestPostgres,
  stopTestPostgres,
  truncateAllTables,
  type TestPostgres,
} from './postgres';

describe('HorseOwnerAuditFeature migration (Postgres)', () => {
  let db: TestPostgres;
  let dataSource: DataSource;
  const migration = new HorseOwnerAuditFeature1789829900000();

  beforeAll(async () => {
    db = await startTestPostgres();
    dataSource = db.dataSource;
  });

  afterAll(() => stopTestPostgres(db));

  beforeEach(() => truncateAllTables(dataSource));

  const seed = async (
    entityType: string,
    after: Record<string, unknown>,
    reason: string | null,
  ) => {
    const [row] = await dataSource.query<{ id: string }[]>(
      `INSERT INTO audit_logs (action, entity_type, entity_id, after_data, reason, feature)
       VALUES ('UPDATE', $1, $2, $3, $4, 'HORSE_UPDATE') RETURNING id`,
      [entityType, randomUUID(), JSON.stringify(after), reason],
    );
    return row.id;
  };

  const features = async (ids: Record<string, string>) =>
    Object.fromEntries(
      await Promise.all(
        Object.entries(ids).map(
          async ([key, id]): Promise<[string, string]> => {
            const [row] = await dataSource.query<{ feature: string }[]>(
              'SELECT feature FROM audit_logs WHERE id = $1',
              [id],
            );
            return [key, row.feature];
          },
        ),
      ),
    );

  it('moves only internal transfer rows to HORSE_OWNER and reverts them on down', async () => {
    const rows = {
      transfer: await seed('HORSE', { ownerId: randomUUID() }, 'HĐ 12'),
      assign: await seed('HORSE', { ownerId: randomUUID() }, null),
      assignWithName: await seed(
        'HORSE',
        { ownerId: randomUUID(), name: 'Mây' },
        null,
      ),
      rename: await seed('HORSE', { name: 'Gió' }, null),
      otherEntity: await seed(
        'HORSE_OWNERSHIP',
        { ownerId: randomUUID() },
        'HĐ',
      ),
    };
    const runner = dataSource.createQueryRunner();
    try {
      await migration.up(runner);
      expect(await features(rows)).toEqual({
        transfer: 'HORSE_OWNER',
        assign: 'HORSE_UPDATE',
        assignWithName: 'HORSE_UPDATE',
        rename: 'HORSE_UPDATE',
        otherEntity: 'HORSE_UPDATE',
      });

      await migration.down(runner);
      expect(Object.values(await features(rows))).toEqual(
        Array(5).fill('HORSE_UPDATE'),
      );
    } finally {
      await runner.release();
    }
  });
});

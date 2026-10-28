import { DataSource } from 'typeorm';
import { UserRole } from '../../src/common/enums/role.enum';
import { HorseLifecycleStatus } from '../../src/modules/horses/enums/horse-status.enum';
import { TransferredHorsesEndOwnership1789827500000 } from '../../src/migrations/1789827500000-TransferredHorsesEndOwnership';
import { fixtures } from './fixtures';
import {
  startTestPostgres,
  stopTestPostgres,
  truncateAllTables,
  type TestPostgres,
} from './postgres';

describe('TransferredHorsesEndOwnership migration (Postgres)', () => {
  let db: TestPostgres;
  let dataSource: DataSource;
  const migration = new TransferredHorsesEndOwnership1789827500000();

  beforeAll(async () => {
    db = await startTestPostgres();
    dataSource = db.dataSource;
  });

  afterAll(() => stopTestPostgres(db));

  beforeEach(() => truncateAllTables(dataSource));

  it('ends the ownership of transferred horses at their last lifecycle change and keeps the others', async () => {
    const seed = fixtures(dataSource);
    const owner = await seed.user(UserRole.HORSE_OWNER);
    const sold = await seed.horse('Đã bán', {
      ownerId: owner,
      lifecycle: HorseLifecycleStatus.TRANSFERRED,
    });
    await dataSource.query(
      `UPDATE horses SET lifecycle_changed_at = '2026-10-01T03:00:00Z' WHERE id = $1`,
      [sold],
    );
    await seed.ownership(sold, owner, '2026-09-01T00:00:00Z');
    const kept = await seed.horse('Còn ở CLB', { ownerId: owner });
    await seed.ownership(kept, owner, '2026-09-01T00:00:00Z');
    const runner = dataSource.createQueryRunner();

    try {
      await migration.up(runner);

      await expect(
        dataSource.query(
          `SELECT h.name, h.owner_id, o.ended_at
             FROM horses h JOIN horse_ownerships o ON o.horse_id = h.id
            ORDER BY h.name`,
        ),
      ).resolves.toEqual([
        { name: 'Còn ở CLB', owner_id: owner, ended_at: null },
        {
          name: 'Đã bán',
          owner_id: null,
          ended_at: new Date('2026-10-01T03:00:00Z'),
        },
      ]);

      await migration.down(runner);

      await expect(
        dataSource.query(
          `SELECT h.owner_id, o.ended_at FROM horses h
             JOIN horse_ownerships o ON o.horse_id = h.id WHERE h.id = $1`,
          [sold],
        ),
      ).resolves.toEqual([{ owner_id: owner, ended_at: null }]);
    } finally {
      await runner.release();
    }
  });
});

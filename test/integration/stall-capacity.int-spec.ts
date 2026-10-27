import { DataSource } from 'typeorm';
import { randomUUID } from 'node:crypto';
import { HorseLifecycleStatus } from '../../src/modules/horses/enums/horse-status.enum';
import type { HorseAccessService } from '../../src/modules/horses/shared/horse-access.service';
import { StableAccessService } from '../../src/modules/stable/shared/stable-access.service';
import { fixtures } from './fixtures';
import {
  startTestPostgres,
  stopTestPostgres,
  truncateAllTables,
  type TestPostgres,
} from './postgres';

describe('StableAccessService.countStallCapacity (Postgres)', () => {
  let db: TestPostgres;
  let dataSource: DataSource;
  let access: StableAccessService;
  let seed: ReturnType<typeof fixtures>;

  beforeAll(async () => {
    db = await startTestPostgres();
    dataSource = db.dataSource;
    access = new StableAccessService({} as HorseAccessService);
    seed = fixtures(dataSource);
  });

  afterAll(() => stopTestPostgres(db));

  beforeEach(() => truncateAllTables(dataSource));

  it('counts only waiting horses whose profile is writable', async () => {
    const barn = await seed.barn('Khu A');
    await dataSource.query(
      `INSERT INTO stalls (id, version, barn_id, code) VALUES ($1, 1, $2, 'A-01')`,
      [randomUUID(), barn],
    );
    await seed.horse('Hoạt động', { barnId: barn });
    await seed.horse('Giải nghệ', {
      barnId: barn,
      lifecycle: HorseLifecycleStatus.RETIRED,
    });
    await seed.horse('Chuyển nhượng', {
      barnId: barn,
      lifecycle: HorseLifecycleStatus.TRANSFERRED,
    });
    await seed.horse('Đã mất', {
      barnId: barn,
      lifecycle: HorseLifecycleStatus.DECEASED,
    });
    await seed.horse('Đã xóa', { barnId: barn, deleted: true });

    const capacity = await access.countStallCapacity(dataSource.manager, [
      barn,
    ]);

    expect(capacity.get(barn)).toEqual({
      freeStallCount: 1,
      pendingStallHorseCount: 2,
    });
  });
});

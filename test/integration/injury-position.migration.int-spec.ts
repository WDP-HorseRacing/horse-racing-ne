import { DataSource } from 'typeorm';
import { UserRole } from '../../src/common/enums/role.enum';
import { InjuryPositionRequired1789827400000 } from '../../src/migrations/1789827400000-InjuryPositionRequired';
import { fixtures } from './fixtures';
import {
  startTestPostgres,
  stopTestPostgres,
  type TestPostgres,
} from './postgres';

describe('InjuryPositionRequired migration (Postgres)', () => {
  let db: TestPostgres;
  let dataSource: DataSource;

  beforeAll(async () => {
    db = await startTestPostgres();
    dataSource = db.dataSource;
  });

  afterAll(() => stopTestPostgres(db));

  it('refuses an injury without 3D coordinates, and allows it again after reverting', async () => {
    const seed = fixtures(dataSource);
    const vet = await seed.user(UserRole.VETERINARIAN);
    const recordId = await seed.visit(
      await seed.horse('Gió'),
      vet,
      '2026-10-03T02:00:00Z',
    );
    const insert = () =>
      dataSource.query(
        `INSERT INTO injury_markers (medical_record_id, body_region, injury_type, recovery_status)
         VALUES ($1, 'LEFT_FRONT_LEG', 'SPRAIN', 'ACUTE')`,
        [recordId],
      );

    await expect(insert()).rejects.toThrow(/position/);

    const runner = dataSource.createQueryRunner();
    try {
      await new InjuryPositionRequired1789827400000().down(runner);
      await expect(insert()).resolves.toBeDefined();
    } finally {
      await runner.release();
    }
  });
});

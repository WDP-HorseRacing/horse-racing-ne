import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { UserRole } from '../../src/common/enums/role.enum';
import { CareScheduleVetOnly1789830300000 } from '../../src/migrations/1789830300000-CareScheduleVetOnly';
import { fixtures } from './fixtures';
import {
  startTestPostgres,
  stopTestPostgres,
  truncateAllTables,
  type TestPostgres,
} from './postgres';

describe('CareScheduleVetOnly migration (Postgres)', () => {
  let db: TestPostgres;
  let dataSource: DataSource;
  let seed: ReturnType<typeof fixtures>;
  const migration = new CareScheduleVetOnly1789830300000();

  beforeAll(async () => {
    db = await startTestPostgres();
    dataSource = db.dataSource;
    seed = fixtures(dataSource);
  });

  afterAll(() => stopTestPostgres(db));

  beforeEach(() => truncateAllTables(dataSource));

  it('drops groom assignments and the assignee kind, keeps vets', async () => {
    const vetId = await seed.user(UserRole.VETERINARIAN);
    const groomId = await seed.user(UserRole.GROOM);
    const horse = await seed.horse('Winx');
    const runner = dataSource.createQueryRunner();
    try {
      await migration.down(runner);
      const insert = async (
        assigneeType: string | null,
        assignedTo: string | null,
        status = 'SCHEDULED',
      ) => {
        const id = randomUUID();
        await runner.query(
          `INSERT INTO care_schedules (id, version, horse_id, type, due_at, status, assignee_type, assigned_to)
           VALUES ($1, 1, $2, 'FARRIER', now(), $3, $4, $5)`,
          [id, horse, status, assigneeType, assignedTo],
        );
        return id;
      };
      const horseGroom = await insert('GROOM', null);
      const namedGroom = await insert('GROOM', groomId, 'COMPLETED');
      const doctor = await insert('VET', vetId);
      const nobody = await insert(null, null);

      await migration.up(runner);

      const rows = (await runner.query(
        'SELECT id, assigned_to FROM care_schedules',
      )) as Array<{ id: string; assigned_to: string | null }>;
      const byId = new Map(rows.map((row) => [row.id, row.assigned_to]));
      expect(byId.get(horseGroom)).toBeNull();
      expect(byId.get(namedGroom)).toBeNull();
      expect(byId.get(doctor)).toBe(vetId);
      expect(byId.get(nobody)).toBeNull();
      expect(await runner.hasColumn('care_schedules', 'assignee_type')).toBe(
        false,
      );
    } finally {
      await runner.release();
    }
  });
});

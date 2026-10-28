import { DataSource } from 'typeorm';
import { TrainingSubjectNameCaseInsensitive1789830200000 } from '../../src/migrations/1789830200000-TrainingSubjectNameCaseInsensitive';
import {
  startTestPostgres,
  stopTestPostgres,
  truncateAllTables,
  type TestPostgres,
} from './postgres';

describe('TrainingSubjectNameCaseInsensitive migration (Postgres)', () => {
  let db: TestPostgres;
  let dataSource: DataSource;
  const migration = new TrainingSubjectNameCaseInsensitive1789830200000();

  beforeAll(async () => {
    db = await startTestPostgres();
    dataSource = db.dataSource;
  });

  afterAll(() => stopTestPostgres(db));

  beforeEach(() => truncateAllTables(dataSource));

  const insert = (name: string) =>
    dataSource.query(
      `INSERT INTO training_subjects (version, name, session_type, intensity, planned_distance_m, duration_minutes)
       VALUES (1, $1, 'REGULAR', 'LIGHT', 1000, 30)`,
      [name],
    );

  const indexDefinition = async () => {
    const [row] = await dataSource.query<{ indexdef: string }[]>(
      `SELECT indexdef FROM pg_indexes WHERE indexname = 'training_subjects_name_uq'`,
    );
    return row?.indexdef;
  };

  it('makes the name unique regardless of case on up, and case sensitive again on down', async () => {
    const runner = dataSource.createQueryRunner();
    try {
      await insert('Nước rút');
      await expect(insert('nước rút')).rejects.toMatchObject({
        code: '23505',
        constraint: 'training_subjects_name_uq',
      });

      await migration.down(runner);
      expect(await indexDefinition()).toContain('(name)');
      await insert('nước rút');
      await dataSource.query(
        `DELETE FROM training_subjects WHERE name = 'nước rút'`,
      );

      await migration.up(runner);
      expect(await indexDefinition()).toContain('lower((name)::text)');
    } finally {
      await runner.release();
    }
  });

  it('stops with the clashing names instead of merging them', async () => {
    const runner = dataSource.createQueryRunner();
    try {
      await migration.down(runner);
      await insert('Nước rút');
      await insert('nước rút');
      await insert('Sức bền');

      await expect(migration.up(runner)).rejects.toThrow(
        'Tên môn học trùng nhau khi không phân biệt hoa thường: "Nước rút", "nước rút". Đổi tên hoặc xóa bớt rồi chạy lại migration',
      );
      expect(await indexDefinition()).toContain('(name)');

      await dataSource.query(
        `DELETE FROM training_subjects WHERE name = 'nước rút'`,
      );
      await migration.up(runner);
      expect(await indexDefinition()).toContain('lower((name)::text)');
    } finally {
      await runner.release();
    }
  });
});

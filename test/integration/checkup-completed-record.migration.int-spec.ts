import { DataSource } from 'typeorm';
import { CheckupCompletedRecord1789829800000 } from '../../src/migrations/1789829800000-CheckupCompletedRecord';
import {
  startTestPostgres,
  stopTestPostgres,
  type TestPostgres,
} from './postgres';

describe('CheckupCompletedRecord migration (Postgres)', () => {
  let db: TestPostgres;
  let dataSource: DataSource;

  beforeAll(async () => {
    db = await startTestPostgres();
    dataSource = db.dataSource;
  });

  afterAll(() => stopTestPostgres(db));

  const foreignKeys = () =>
    dataSource
      .query<{ conname: string }[]>(
        `SELECT conname FROM pg_constraint
          WHERE conname = 'care_schedules_completed_record_fk'`,
      )
      .then((rows) => rows.map((row) => row.conname));

  const hasColumn = () =>
    dataSource
      .query<unknown[]>(
        `SELECT 1 FROM information_schema.columns
          WHERE table_name = 'care_schedules' AND column_name = 'completed_record_id'`,
      )
      .then((rows) => rows.length === 1);

  it('drops the completed record column on revert and adds it back with its foreign key', async () => {
    expect(await hasColumn()).toBe(true);
    expect(await foreignKeys()).toEqual(['care_schedules_completed_record_fk']);

    const runner = dataSource.createQueryRunner();
    try {
      await new CheckupCompletedRecord1789829800000().down(runner);
      expect(await hasColumn()).toBe(false);
      expect(await foreignKeys()).toEqual([]);

      await new CheckupCompletedRecord1789829800000().up(runner);
      expect(await hasColumn()).toBe(true);
      expect(await foreignKeys()).toEqual([
        'care_schedules_completed_record_fk',
      ]);
    } finally {
      await runner.release();
    }
  });
});

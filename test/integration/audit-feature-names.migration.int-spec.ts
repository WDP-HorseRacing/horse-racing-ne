import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import {
  startTestPostgres,
  stopTestPostgres,
  truncateAllTables,
  type TestPostgres,
} from './postgres';
import { AuditFeatureNames1789826500000 } from '../../src/migrations/1789826500000-AuditFeatureNames';

describe('AuditFeatureNames migration (Postgres)', () => {
  let db: TestPostgres;
  let dataSource: DataSource;
  const migration = new AuditFeatureNames1789826500000();

  beforeAll(async () => {
    db = await startTestPostgres();
    dataSource = db.dataSource;
  });

  afterAll(() => stopTestPostgres(db));

  beforeEach(() => truncateAllTables(dataSource));

  const seed = async (entityType: string, feature: string | null) => {
    const [row] = await dataSource.query<{ id: string }[]>(
      `INSERT INTO audit_logs (action, entity_type, entity_id, feature)
       VALUES ('UPDATE', $1, $2, $3) RETURNING id`,
      [entityType, randomUUID(), feature],
    );
    return row.id;
  };

  const featureOf = async (id: string) =>
    (
      await dataSource.query<{ feature: string | null }[]>(
        `SELECT feature FROM audit_logs WHERE id = $1`,
        [id],
      )
    )[0].feature;

  it('renames every code, splits F1.6 by entity type, and reverts on down', async () => {
    const rows = {
      create: await seed('HORSE', 'F1.2'),
      update: await seed('HORSE_OWNERSHIP', 'F1.4'),
      measure: await seed('HORSE_MEASUREMENT', 'F1.5'),
      horseBarn: await seed('HORSE', 'F1.6'),
      barn: await seed('BARN', 'F1.6'),
      stall: await seed('STALL', 'F1.7'),
      lifecycle: await seed('HORSE', 'F1.8'),
      checkup: await seed('CARE_SCHEDULE', 'F3.2'),
      visit: await seed('MEDICAL_RECORD', 'F3.3'),
      request: await seed('MEDICAL_EXAM_REQUEST', 'F3.4'),
      open: await seed('MEDICAL_CASE', 'F3.5'),
      caseVisit: await seed('MEDICAL_RECORD', 'F3.6'),
      health: await seed('HORSE', 'F3.7'),
      lock: await seed('TRAINING_LOCK', 'F3.8'),
      close: await seed('MEDICAL_CASE', 'F3.9'),
      care: await seed('CARE_SCHEDULE', 'F3.11'),
      none: await seed('HORSE', null),
    };
    const runner = dataSource.createQueryRunner();

    await migration.up(runner);

    const after = Object.fromEntries(
      await Promise.all(
        Object.entries(rows).map(
          async ([key, id]): Promise<[string, string | null]> => [
            key,
            await featureOf(id),
          ],
        ),
      ),
    );
    expect(after).toEqual({
      create: 'HORSE_CREATE',
      update: 'HORSE_UPDATE',
      measure: 'HORSE_MEASURE',
      horseBarn: 'HORSE_BARN',
      barn: 'BARN',
      stall: 'STALL_GROOM',
      lifecycle: 'HORSE_LIFECYCLE',
      checkup: 'MED_CHECKUP',
      visit: 'MED_VISIT',
      request: 'MED_EXAM_REQUEST',
      open: 'MED_CASE_OPEN',
      caseVisit: 'MED_CASE_VISIT',
      health: 'MED_HEALTH',
      lock: 'MED_TRAIN_LOCK',
      close: 'MED_CASE_CLOSE',
      care: 'MED_CARE',
      none: null,
    });

    await migration.down(runner);
    await runner.release();

    await expect(featureOf(rows.barn)).resolves.toBe('F1.6');
    await expect(featureOf(rows.horseBarn)).resolves.toBe('F1.6');
    await expect(featureOf(rows.care)).resolves.toBe('F3.11');
    await expect(featureOf(rows.create)).resolves.toBe('F1.2');
  });
});

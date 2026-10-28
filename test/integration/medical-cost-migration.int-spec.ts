import { DataSource } from 'typeorm';
import { UserRole } from '../../src/common/enums/role.enum';
import { MedicalCaseStatus } from '../../src/modules/medical/constants/medical-case.enum';
import { MedicalCostPerVisit1789828500000 } from '../../src/migrations/1789828500000-MedicalCostPerVisit';
import { fixtures } from './fixtures';
import {
  startTestPostgres,
  stopTestPostgres,
  truncateAllTables,
  type TestPostgres,
} from './postgres';

describe('MedicalCostPerVisit migration (Postgres)', () => {
  let db: TestPostgres;
  let dataSource: DataSource;
  let seed: ReturnType<typeof fixtures>;
  const migration = new MedicalCostPerVisit1789828500000();

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

  const costs = () =>
    dataSource.query<Array<{ exam_date: Date; cost: string }>>(
      'SELECT exam_date, cost FROM medical_records ORDER BY exam_date',
    );

  it('moves the cost of each closed case to its last visit not voided and back', async () => {
    const vet = await seed.user(UserRole.VETERINARIAN);
    const winx = await seed.horse('Winx');
    const closed = await seed.medicalCase(winx, vet, {
      status: MedicalCaseStatus.CLOSED,
      closedAt: '2026-09-20T02:00:00Z',
    });
    const open = await seed.medicalCase(winx, vet, {
      openedAt: '2026-10-01T02:00:00Z',
    });
    await seed.visit(winx, vet, '2026-09-01T02:00:00Z', { caseId: closed });
    await seed.visit(winx, vet, '2026-09-10T02:00:00Z', { caseId: closed });
    await seed.visit(winx, vet, '2026-09-15T02:00:00Z', {
      caseId: closed,
      voided: true,
    });
    await seed.visit(winx, vet, '2026-10-01T02:00:00Z', { caseId: open });
    await seed.visit(winx, vet, '2026-10-02T02:00:00Z', { cost: 300 });
    await run('down');
    await dataSource.query(
      'UPDATE medical_cases SET total_cost = 2000000 WHERE id = $1',
      [closed],
    );

    await run('up');

    expect((await costs()).map((row) => row.cost)).toEqual([
      '0',
      '2000000',
      '0',
      '0',
      '0',
    ]);

    await dataSource.query(
      `UPDATE medical_records SET cost = 500 WHERE exam_date = '2026-09-01T02:00:00Z'`,
    );
    await run('down');
    const cases = await dataSource.query<
      Array<{ id: string; total_cost: string | null }>
    >('SELECT id, total_cost FROM medical_cases');
    expect(
      Object.fromEntries(cases.map((row) => [row.id, row.total_cost])),
    ).toEqual({ [closed]: '2000500', [open]: null });
    await run('up');
  });

  it('refuses to run when a closed case with a cost has no visit left', async () => {
    const vet = await seed.user(UserRole.VETERINARIAN);
    const winx = await seed.horse('Winx');
    const closed = await seed.medicalCase(winx, vet, {
      status: MedicalCaseStatus.CLOSED,
      closedAt: '2026-09-20T02:00:00Z',
    });
    await seed.visit(winx, vet, '2026-09-01T02:00:00Z', {
      caseId: closed,
      voided: true,
    });
    await run('down');
    await dataSource.query(
      'UPDATE medical_cases SET total_cost = 10 WHERE id = $1',
      [closed],
    );

    await expect(run('up')).rejects.toThrow(
      '1 bệnh án đã đóng có chi phí nhưng không còn buổi khám chưa hủy',
    );
    await dataSource.query('UPDATE medical_cases SET total_cost = NULL');
    await run('up');
  });
});

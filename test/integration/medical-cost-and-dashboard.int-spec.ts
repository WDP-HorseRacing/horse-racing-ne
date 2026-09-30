import { DataSource } from 'typeorm';
import { UserRole } from '../../src/common/enums/role.enum';
import { MedicalCaseStatus } from '../../src/modules/medical/constants/medical-case.enum';
import { MedicalDashboardRepository } from '../../src/modules/medical/medical-dashboard/medical-dashboard.repository';
import { MedicalCasesRepository } from '../../src/modules/medical/medical-records/medical-cases.repository';
import { fixtures } from './fixtures';
import {
  startTestDatabase,
  stopTestDatabase,
  truncateAll,
  type TestDatabase,
} from './postgres';

describe('Medical cost report and dashboard queries (Postgres)', () => {
  let db: TestDatabase;
  let dataSource: DataSource;
  let seed: ReturnType<typeof fixtures>;
  let cases: MedicalCasesRepository;
  let dashboard: MedicalDashboardRepository;
  let vet: string;

  beforeAll(async () => {
    db = await startTestDatabase();
    dataSource = db.dataSource;
    seed = fixtures(dataSource);
    cases = new MedicalCasesRepository(dataSource);
    dashboard = new MedicalDashboardRepository(dataSource);
  });

  afterAll(() => stopTestDatabase(db));

  beforeEach(async () => {
    await truncateAll(dataSource);
    vet = await seed.user(UserRole.VETERINARIAN);
  });

  describe('costByHorse', () => {
    const closed = (horseId: string, closedAt: string, totalCost: number) =>
      seed.medicalCase(horseId, vet, {
        status: MedicalCaseStatus.CLOSED,
        closedAt,
        totalCost,
      });

    it('sums only closed cases per horse, highest cost first', async () => {
      const winx = await seed.horse('Winx');
      const bolt = await seed.horse('Bolt');
      await closed(winx, '2026-09-10T02:00:00Z', 1_000_000);
      await closed(winx, '2026-09-12T02:00:00Z', 500_000);
      await closed(bolt, '2026-09-11T02:00:00Z', 2_000_000);
      await seed.medicalCase(winx, vet, { status: MedicalCaseStatus.OPEN });
      await seed.medicalCase(winx, vet, {
        status: MedicalCaseStatus.CANCELLED,
        closedAt: '2026-09-13T02:00:00Z',
        totalCost: 9_000_000,
      });

      const rows = await cases.costByHorse({
        from: '2026-09-01',
        to: '2026-09-30',
      });

      expect(rows).toEqual([
        {
          horseId: bolt,
          horseName: 'Bolt',
          caseCount: 1,
          totalCost: '2000000',
        },
        {
          horseId: winx,
          horseName: 'Winx',
          caseCount: 2,
          totalCost: '1500000',
        },
      ]);
    });

    it('takes both ends of the range on the club calendar', async () => {
      const winx = await seed.horse('Winx');
      await closed(winx, '2026-08-31T16:30:00Z', 100);
      await closed(winx, '2026-09-30T16:30:00Z', 200);
      await closed(winx, '2026-08-31T16:59:00Z', 1);
      await closed(winx, '2026-09-30T17:00:00Z', 1000);
      await closed(winx, '2026-08-31T17:00:00Z', 10);

      const rows = await cases.costByHorse({
        from: '2026-09-01',
        to: '2026-09-30',
      });

      expect(rows).toEqual([
        expect.objectContaining({ caseCount: 2, totalCost: '210' }),
      ]);
    });

    it('filters by barn and owner on the current profile, keeping deleted profiles', async () => {
      const barn = await seed.barn('Khu Đông');
      const owner = await seed.user(UserRole.HORSE_OWNER);
      const inBarn = await seed.horse('In barn', { barnId: barn });
      const deletedOwned = await seed.horse('Deleted owned', {
        ownerId: owner,
        deleted: true,
      });
      const other = await seed.horse('Other');
      for (const horseId of [inBarn, deletedOwned, other]) {
        await closed(horseId, '2026-09-10T02:00:00Z', 100);
      }
      const range = { from: '2026-09-01', to: '2026-09-30' };

      const byBarn = await cases.costByHorse({ ...range, barnId: barn });
      const byOwner = await cases.costByHorse({ ...range, ownerId: owner });

      expect(byBarn.map((row) => row.horseId)).toEqual([inBarn]);
      expect(byOwner.map((row) => row.horseId)).toEqual([deletedOwned]);
    });
  });

  describe('closedCostOfHorse', () => {
    it('sums every closed case of the horse and ignores other statuses', async () => {
      const winx = await seed.horse('Winx');
      const other = await seed.horse('Other');
      await seed.medicalCase(winx, vet, {
        status: MedicalCaseStatus.CLOSED,
        closedAt: '2025-01-10T02:00:00Z',
        totalCost: 300,
      });
      await seed.medicalCase(winx, vet, {
        status: MedicalCaseStatus.CLOSED,
        closedAt: '2026-09-10T02:00:00Z',
        totalCost: 700,
      });
      await seed.medicalCase(winx, vet, {
        status: MedicalCaseStatus.CANCELLED,
        totalCost: 5000,
      });
      await seed.medicalCase(other, vet, {
        status: MedicalCaseStatus.CLOSED,
        closedAt: '2026-09-10T02:00:00Z',
        totalCost: 9000,
      });

      await expect(cases.closedCostOfHorse(winx)).resolves.toBe(1000);
    });

    it('answers 0 for a horse without closed cases', async () => {
      const winx = await seed.horse('Winx');
      await expect(cases.closedCostOfHorse(winx)).resolves.toBe(0);
    });
  });

  describe('openCases', () => {
    it('lists open cases of the given horses with their latest visit that was not voided', async () => {
      const winx = await seed.horse('Winx');
      const bolt = await seed.horse('Bolt');
      const hidden = await seed.horse('Hidden');
      const winxCase = await seed.medicalCase(winx, vet, {
        openedAt: '2026-09-01T02:00:00Z',
      });
      await seed.visit(winx, vet, '2026-09-05T02:00:00Z', {
        caseId: winxCase,
        nextVisitAt: '2026-10-05T02:00:00Z',
      });
      await seed.visit(winx, vet, '2026-09-08T02:00:00Z', {
        caseId: winxCase,
        nextVisitAt: '2026-09-20T02:00:00Z',
      });
      await seed.visit(winx, vet, '2026-09-09T02:00:00Z', {
        caseId: winxCase,
        nextVisitAt: '2026-12-01T02:00:00Z',
        voided: true,
      });
      const boltCase = await seed.medicalCase(bolt, vet, {
        openedAt: '2026-08-01T02:00:00Z',
      });
      await seed.medicalCase(bolt, vet, {
        status: MedicalCaseStatus.CLOSED,
        closedAt: '2026-07-01T02:00:00Z',
        totalCost: 1,
      });
      await seed.medicalCase(hidden, vet);

      const rows = await dashboard.openCases([winx, bolt]);

      expect(rows.map((row) => row.caseId)).toEqual([winxCase, boltCase]);
      expect(rows[0]).toMatchObject({
        horseName: 'Winx',
        lastVisitAt: new Date('2026-09-08T02:00:00Z'),
        nextVisitAt: new Date('2026-09-20T02:00:00Z'),
      });
      expect(rows[1]).toMatchObject({ lastVisitAt: null, nextVisitAt: null });
    });

    it('answers nothing without querying when no horse is shown', async () => {
      await expect(dashboard.openCases([])).resolves.toEqual([]);
    });
  });
});

import { DataSource } from 'typeorm';
import { UserRole } from '../../src/common/enums/role.enum';
import { MedicalCaseStatus } from '../../src/modules/medical/constants/medical-case.enum';
import { MedicalDashboardRepository } from '../../src/modules/medical/medical-dashboard/medical-dashboard.repository';
import { MedicalCaseEntity } from '../../src/modules/medical/entities/medical-case.entity';
import { MedicalCasesRepository } from '../../src/modules/medical/medical-records/medical-cases.repository';
import { MedicalCasesService } from '../../src/modules/medical/medical-records/medical-cases.service';
import { fixtures } from './fixtures';
import {
  startTestPostgres,
  stopTestPostgres,
  truncateAllTables,
  type TestPostgres,
} from './postgres';

describe('Medical cost report and dashboard queries (Postgres)', () => {
  let db: TestPostgres;
  let dataSource: DataSource;
  let seed: ReturnType<typeof fixtures>;
  let cases: MedicalCasesRepository;
  let caseService: MedicalCasesService;
  let dashboard: MedicalDashboardRepository;
  let vet: string;

  beforeAll(async () => {
    db = await startTestPostgres();
    dataSource = db.dataSource;
    seed = fixtures(dataSource);
    cases = new MedicalCasesRepository(dataSource);
    const unused = {} as never;
    caseService = new MedicalCasesService(
      dataSource,
      unused,
      unused,
      unused,
      unused,
      cases,
      dataSource.getRepository(MedicalCaseEntity),
      unused,
      unused,
      unused,
      unused,
      unused,
    );
    dashboard = new MedicalDashboardRepository(dataSource);
  });

  afterAll(() => stopTestPostgres(db));

  beforeEach(async () => {
    await truncateAllTables(dataSource);
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

    it('filters by barn on the current profile and by owner period, keeping deleted profiles', async () => {
      const barn = await seed.barn('Khu Đông');
      const owner = await seed.user(UserRole.HORSE_OWNER);
      const inBarn = await seed.horse('In barn', { barnId: barn });
      const deletedOwned = await seed.horse('Deleted owned', {
        ownerId: owner,
        deleted: true,
      });
      await seed.ownership(deletedOwned, owner, '2026-01-01T03:00:00Z');
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

    it('charges each case to the owner of the period it was closed in', async () => {
      const a = await seed.user(UserRole.HORSE_OWNER);
      const b = await seed.user(UserRole.HORSE_OWNER);
      const winx = await seed.horse('Winx', { ownerId: b });
      await seed.ownership(
        winx,
        a,
        '2026-01-01T03:00:00Z',
        '2026-06-01T03:00:00Z',
      );
      await seed.ownership(winx, b, '2026-06-01T03:00:00Z');
      await closed(winx, '2026-03-10T03:00:00Z', 5_000_000);
      await closed(winx, '2026-08-10T03:00:00Z', 3_000_000);
      await closed(winx, '2026-06-01T03:00:00Z', 7);
      const range = { from: '2026-01-01', to: '2026-12-31' };

      const byA = await cases.costByHorse({ ...range, ownerId: a });
      const byB = await cases.costByHorse({ ...range, ownerId: b });

      expect(byA).toEqual([
        {
          horseId: winx,
          horseName: 'Winx',
          caseCount: 1,
          totalCost: '5000000',
        },
      ]);
      expect(byB).toEqual([
        {
          horseId: winx,
          horseName: 'Winx',
          caseCount: 2,
          totalCost: '3000007',
        },
      ]);
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

      await expect(caseService['closedCostOfHorse'](winx)).resolves.toBe(1000);
    });

    it('answers 0 for a horse without closed cases', async () => {
      const winx = await seed.horse('Winx');
      await expect(caseService['closedCostOfHorse'](winx)).resolves.toBe(0);
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

  describe('todayPrescriptions', () => {
    const today = '2026-10-18';
    const prescribe = async (
      recordId: string,
      medicine: string,
      startDate: string,
      endDate: string | null,
    ) => {
      await dataSource.query(
        `INSERT INTO prescriptions (medical_record_id, medicine, dosage, frequency, start_date, end_date)
         VALUES ($1, $2, '10 ml', '2 lần/ngày', $3, $4)`,
        [recordId, medicine, startDate, endDate],
      );
    };

    it('lists prescriptions in effect today on the club calendar', async () => {
      const winx = await seed.horse('Winx');
      const bolt = await seed.horse('Bolt');
      const hidden = await seed.horse('Hidden');
      const record = await seed.visit(winx, vet, '2026-10-10T02:00:00Z');
      const voided = await seed.visit(winx, vet, '2026-10-11T02:00:00Z', {
        voided: true,
      });
      const openCase = await seed.medicalCase(bolt, vet);
      const inOpenCase = await seed.visit(bolt, vet, '2026-10-12T02:00:00Z', {
        caseId: openCase,
      });
      const closedCase = await seed.medicalCase(bolt, vet, {
        status: MedicalCaseStatus.CLOSED,
        closedAt: '2026-10-15T02:00:00Z',
        totalCost: 1,
      });
      const inClosedCase = await seed.visit(bolt, vet, '2026-10-01T02:00:00Z', {
        caseId: closedCase,
      });
      const hiddenRecord = await seed.visit(
        hidden,
        vet,
        '2026-10-10T02:00:00Z',
      );
      await prescribe(record, 'Ends today', '2026-10-10', today);
      await prescribe(record, 'Starts today', today, '2026-10-20');
      await prescribe(record, 'Ended yesterday', '2026-10-10', '2026-10-17');
      await prescribe(record, 'Starts tomorrow', '2026-10-19', '2026-10-25');
      await prescribe(record, 'No end, no case', '2026-10-10', null);
      await prescribe(voided, 'Voided visit', '2026-10-11', '2026-10-30');
      await prescribe(inOpenCase, 'No end, open case', '2026-10-12', null);
      await prescribe(inClosedCase, 'No end, closed case', '2026-10-01', null);
      await prescribe(hiddenRecord, 'Other horse', '2026-10-10', today);

      const rows = await dashboard.todayPrescriptions([winx, bolt], today);

      expect(rows.map((row) => row.medicine)).toEqual([
        'No end, open case',
        'Ends today',
        'Starts today',
      ]);
      expect(rows[0]).toMatchObject({
        horseId: bolt,
        horseName: 'Bolt',
        dosage: '10 ml',
        frequency: '2 lần/ngày',
        startDate: '2026-10-12',
        endDate: null,
        medicalRecordId: inOpenCase,
        caseId: openCase,
      });
      expect(rows[1]).toMatchObject({
        horseName: 'Winx',
        endDate: today,
        medicalRecordId: record,
        caseId: null,
      });
    });

    it('answers nothing without querying when no horse is shown', async () => {
      await expect(dashboard.todayPrescriptions([], today)).resolves.toEqual(
        [],
      );
    });
  });
});

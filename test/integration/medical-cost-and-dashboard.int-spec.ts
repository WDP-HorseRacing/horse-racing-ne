import { DataSource } from 'typeorm';
import { UserRole } from '../../src/common/enums/role.enum';
import { MedicalCaseStatus } from '../../src/modules/medical/constants/medical-case.enum';
import { MedicalDashboardRepository } from '../../src/modules/medical/medical-dashboard/medical-dashboard.repository';
import type { Actor } from '../../src/common/types/actor';
import { HorseOwnershipService } from '../../src/modules/horses/shared/horse-ownership.service';
import type { HorseAccessService } from '../../src/modules/horses/shared/horse-access.service';
import { InjuryMarkerEntity } from '../../src/modules/medical/entities/injury-marker.entity';
import { MedicalCaseEntity } from '../../src/modules/medical/entities/medical-case.entity';
import { MedicalRecordEntity } from '../../src/modules/medical/entities/medical-record.entity';
import { PrescriptionEntity } from '../../src/modules/medical/entities/prescription.entity';
import { MedicalRecordsService } from '../../src/modules/medical/medical-records/medical-records.service';
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
    const horseAccess = {
      currentUser: (actor: Actor) => Promise.resolve({ id: actor.sub }),
      findReadableHorse: () => Promise.resolve({}),
      scopeOf: (actor: Actor, userId: string) =>
        actor.roles.includes(UserRole.HORSE_OWNER)
          ? { kind: 'OWNER', userId }
          : { kind: 'ALL' },
    } as unknown as HorseAccessService;
    const ownerships = new HorseOwnershipService();
    caseService = new MedicalCasesService(
      dataSource,
      horseAccess,
      unused,
      unused,
      new MedicalRecordsService(
        horseAccess,
        dataSource.getRepository(MedicalRecordEntity),
        dataSource.getRepository(PrescriptionEntity),
        dataSource.getRepository(InjuryMarkerEntity),
        ownerships,
      ),
      cases,
      dataSource.getRepository(MedicalCaseEntity),
      dataSource.getRepository(MedicalRecordEntity),
      unused,
      unused,
      ownerships,
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
    const paid = (
      horseId: string,
      examDate: string,
      cost: number,
      options: { caseId?: string; voided?: boolean } = {},
    ) => seed.visit(horseId, vet, examDate, { ...options, cost });

    it('sums the visits not voided per horse, in and out of cases, highest cost first', async () => {
      const winx = await seed.horse('Winx');
      const bolt = await seed.horse('Bolt');
      const openCase = await seed.medicalCase(winx, vet);
      await paid(winx, '2026-09-10T02:00:00Z', 1_000_000, { caseId: openCase });
      await paid(winx, '2026-09-12T02:00:00Z', 500_000);
      await paid(winx, '2026-09-13T02:00:00Z', 9_000_000, { voided: true });
      await paid(bolt, '2026-09-11T02:00:00Z', 2_000_000);

      const rows = await cases.costByHorse({
        from: '2026-09-01',
        to: '2026-09-30',
      });

      expect(rows).toEqual([
        {
          horseId: bolt,
          horseName: 'Bolt',
          visitCount: 1,
          totalCost: '2000000',
        },
        {
          horseId: winx,
          horseName: 'Winx',
          visitCount: 2,
          totalCost: '1500000',
        },
      ]);
    });

    it('takes both ends of the range on the club calendar of the exam date', async () => {
      const winx = await seed.horse('Winx');
      const closedLater = await seed.medicalCase(winx, vet, {
        status: MedicalCaseStatus.CLOSED,
        openedAt: '2026-08-31T16:00:00Z',
        closedAt: '2026-10-05T02:00:00Z',
      });
      await paid(winx, '2026-08-31T16:30:00Z', 100);
      await paid(winx, '2026-09-30T16:30:00Z', 200, { caseId: closedLater });
      await paid(winx, '2026-08-31T16:59:00Z', 1);
      await paid(winx, '2026-09-30T17:00:00Z', 1000);
      await paid(winx, '2026-08-31T17:00:00Z', 10);

      const rows = await cases.costByHorse({
        from: '2026-09-01',
        to: '2026-09-30',
      });

      expect(rows).toEqual([
        expect.objectContaining({ visitCount: 2, totalCost: '210' }),
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
        await paid(horseId, '2026-09-10T02:00:00Z', 100);
      }
      const range = { from: '2026-09-01', to: '2026-09-30' };

      const byBarn = await cases.costByHorse({ ...range, barnId: barn });
      const byOwner = await cases.costByHorse({ ...range, ownerId: owner });

      expect(byBarn.map((row) => row.horseId)).toEqual([inBarn]);
      expect(byOwner.map((row) => row.horseId)).toEqual([deletedOwned]);
    });

    it('charges each visit to the owner of the period holding its exam date, even inside one case', async () => {
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
      const spanning = await seed.medicalCase(winx, vet, {
        status: MedicalCaseStatus.CLOSED,
        openedAt: '2026-05-20T03:00:00Z',
        closedAt: '2026-06-20T03:00:00Z',
      });
      await paid(winx, '2026-03-10T03:00:00Z', 5_000_000);
      await paid(winx, '2026-05-20T03:00:00Z', 3_000_000, {
        caseId: spanning,
      });
      await paid(winx, '2026-06-01T03:00:00Z', 7, { caseId: spanning });
      await paid(winx, '2026-06-10T03:00:00Z', 2_000_000, {
        caseId: spanning,
      });
      const range = { from: '2026-01-01', to: '2026-12-31' };

      const byA = await cases.costByHorse({ ...range, ownerId: a });
      const byB = await cases.costByHorse({ ...range, ownerId: b });

      expect(byA).toEqual([
        {
          horseId: winx,
          horseName: 'Winx',
          visitCount: 2,
          totalCost: '8000000',
        },
      ]);
      expect(byB).toEqual([
        {
          horseId: winx,
          horseName: 'Winx',
          visitCount: 2,
          totalCost: '2000007',
        },
      ]);
    });
  });

  describe('case and horse totals', () => {
    const owner = (id: string): Actor => ({
      sub: id,
      roles: [UserRole.HORSE_OWNER],
    });
    const manager: Actor = { sub: 'cm', roles: [UserRole.CLUB_MANAGER] };
    const trainer: Actor = { sub: 'ht', roles: [UserRole.HEAD_TRAINER] };

    it('sums the visits not voided, splits them by ownership period and hides them from a head trainer', async () => {
      const a = await seed.user(UserRole.HORSE_OWNER);
      const b = await seed.user(UserRole.HORSE_OWNER);
      const winx = await seed.horse('Winx', { ownerId: b });
      const other = await seed.horse('Other');
      await seed.ownership(
        winx,
        a,
        '2026-01-01T03:00:00Z',
        '2026-06-01T03:00:00Z',
      );
      await seed.ownership(winx, b, '2026-06-01T03:00:00Z');
      const spanning = await seed.medicalCase(winx, vet, {
        openedAt: '2026-05-20T03:00:00Z',
      });
      await seed.visit(winx, vet, '2026-05-20T03:00:00Z', {
        caseId: spanning,
        cost: 3_000_000,
      });
      await seed.visit(winx, vet, '2026-06-10T03:00:00Z', {
        caseId: spanning,
        cost: 2_000_000,
      });
      await seed.visit(winx, vet, '2026-06-11T03:00:00Z', {
        caseId: spanning,
        cost: 9_000_000,
        voided: true,
      });
      await seed.visit(winx, vet, '2026-07-01T03:00:00Z', { cost: 100_000 });
      await seed.visit(other, vet, '2026-07-01T03:00:00Z', { cost: 1 });

      const forManager = await caseService.listCases(manager, winx, {});
      const forB = await caseService.listCases(owner(b), winx, {});
      const detailForB = await caseService.getCase(owner(b), spanning);
      const forTrainer = await caseService.getCase(trainer, spanning);

      expect(forManager).toEqual({
        items: [
          expect.objectContaining({ id: spanning, totalCost: 5_000_000 }),
        ],
        totalCost: 5_100_000,
      });
      expect(forB).toEqual({
        items: [
          expect.objectContaining({ id: spanning, totalCost: 2_000_000 }),
        ],
        totalCost: 2_100_000,
      });
      expect(
        detailForB.visits.map((visit) => [visit.cost, visit.costHidden]),
      ).toEqual([
        [9_000_000, false],
        [2_000_000, false],
        [null, true],
      ]);
      expect(forTrainer).not.toHaveProperty('totalCost');
      for (const visit of forTrainer.visits) {
        expect(visit).not.toHaveProperty('cost');
      }
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

import { BadRequestException, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { UserRole } from '../../src/common/enums/role.enum';
import type { Actor } from '../../src/common/types/actor';
import { HorseLifecycleStatus } from '../../src/modules/horses/enums/horse-status.enum';
import { MedicalCaseStatus } from '../../src/modules/medical/constants/medical-case.enum';
import { FinanceReportsRepository } from '../../src/modules/reports/finance-reports/finance-reports.repository';
import { FinanceReportsService } from '../../src/modules/reports/finance-reports/finance-reports.service';
import { fixtures } from './fixtures';
import {
  startTestPostgres,
  stopTestPostgres,
  truncateAllTables,
  type TestPostgres,
} from './postgres';

describe('Reports finance (Postgres)', () => {
  let db: TestPostgres;
  let dataSource: DataSource;
  let seed: ReturnType<typeof fixtures>;
  let service: FinanceReportsService;
  let manager: Actor;
  let ownerA: Actor;
  let aId: string;
  let bId: string;
  let gio: string;
  let may: string;
  let sao: string;

  beforeAll(async () => {
    db = await startTestPostgres();
    dataSource = db.dataSource;
    seed = fixtures(dataSource);
    service = new FinanceReportsService(
      new FinanceReportsRepository(dataSource),
      dataSource,
    );
  });

  afterAll(async () => {
    await stopTestPostgres(db);
  });

  const actorOf = async (id: string, role: UserRole): Promise<Actor> => {
    const [row] = await dataSource.query<Array<{ keycloak_id: string }>>(
      'SELECT keycloak_id FROM users WHERE id = $1',
      [id],
    );
    return { sub: row.keycloak_id, roles: [role] };
  };

  const ownerNamed = async (name: string) => {
    const id = await seed.user(UserRole.HORSE_OWNER);
    await dataSource.query('UPDATE users SET full_name = $1 WHERE id = $2', [
      name,
      id,
    ]);
    return id;
  };

  const lifecycle = (
    horseId: string,
    from: HorseLifecycleStatus,
    to: HorseLifecycleStatus,
    at: string,
  ) => seed.lifecycleAudit(horseId, from, to, at);

  const movement = async (
    itemId: string,
    type: string,
    quantity: string,
    unitPrice: number,
    at: string,
    createdBy: string,
  ) => {
    const [lot] = await dataSource.query<Array<{ id: string }>>(
      `INSERT INTO supply_lots (version, item_id, quantity, remaining, unit_price, created_at)
       VALUES (1, $1, $2, $2, $3, $4) RETURNING id`,
      [itemId, quantity.replace('-', ''), unitPrice, at],
    );
    await dataSource.query(
      `INSERT INTO supply_stock_movements (item_id, lot_id, delta, balance_after, type, created_by, created_at)
       VALUES ($1, $2, $3, 0, $4, $5, $6)`,
      [itemId, lot.id, quantity, type, createdBy, at],
    );
  };

  beforeEach(async () => {
    await truncateAllTables(dataSource);
    const managerId = await seed.user(UserRole.CLUB_MANAGER);
    manager = await actorOf(managerId, UserRole.CLUB_MANAGER);
    const vet = await seed.user(UserRole.VETERINARIAN);
    aId = await ownerNamed('An');
    bId = await ownerNamed('Bình');
    ownerA = await actorOf(aId, UserRole.HORSE_OWNER);

    gio = await seed.horse('Gió', { ownerId: bId });
    may = await seed.horse('Mây', { ownerId: aId });
    sao = await seed.horse('Sao');
    const sold = await seed.horse('Đã bán', {
      ownerId: aId,
      lifecycle: HorseLifecycleStatus.TRANSFERRED,
    });
    await seed.ownership(sold, aId, '2026-09-01T00:00:00Z');
    const deleted = await seed.horse('Nhập nhầm', {
      ownerId: aId,
      deleted: true,
    });
    await seed.ownership(deleted, aId, '2026-09-01T00:00:00Z');
    await seed.ownership(
      gio,
      aId,
      '2026-09-01T00:00:00Z',
      '2026-10-10T05:00:00Z',
    );
    await seed.ownership(gio, bId, '2026-10-10T05:00:00Z');
    await seed.ownership(may, aId, '2026-09-01T00:00:00Z');
    await lifecycle(
      may,
      HorseLifecycleStatus.ACTIVE,
      HorseLifecycleStatus.RETIRED,
      '2026-10-06T02:00:00Z',
    );
    await lifecycle(
      may,
      HorseLifecycleStatus.RETIRED,
      HorseLifecycleStatus.TRANSFERRED,
      '2026-10-09T02:00:00Z',
    );

    for (const [effectiveFrom, fee] of [
      ['2026-10-05', 100000],
      ['2026-10-08', 200000],
    ] as const) {
      await dataSource.query(
        `INSERT INTO daily_fees (effective_from, daily_fee, created_by) VALUES ($1, $2, $3)`,
        [effectiveFrom, fee, managerId],
      );
    }

    for (const [horseId, amount, start, end] of [
      [gio, 50000, '2026-10-08', '2026-10-11'],
      [may, 30000, '2026-10-07', '2026-10-10'],
    ] as const) {
      await dataSource.query(
        `INSERT INTO horse_surcharges (version, horse_id, description, daily_amount, start_date, end_date, created_by)
         VALUES (1, $1, 'Chăm riêng', $2, $3, $4, $5)`,
        [horseId, amount, start, end, managerId],
      );
    }

    const closed = (horseId: string, closedAt: string, totalCost: number) =>
      seed.medicalCase(horseId, vet, {
        status: MedicalCaseStatus.CLOSED,
        openedAt: '2026-08-01T00:00:00Z',
        closedAt,
        totalCost,
      });
    await closed(gio, '2026-10-09T03:00:00Z', 1000000);
    await closed(gio, '2026-10-11T03:00:00Z', 2000000);
    await closed(gio, '2026-09-20T03:00:00Z', 5000000);
    await closed(sao, '2026-10-03T03:00:00Z', 300000);
    await seed.medicalCase(sao, vet, { openedAt: '2026-10-04T00:00:00Z' });

    const [item] = await dataSource.query<Array<{ id: string }>>(
      `INSERT INTO supply_items (version, name, category, unit) VALUES (1, 'Yến mạch', 'FEED', 'kg') RETURNING id`,
    );
    await movement(
      item.id,
      'RESTOCK',
      '10',
      15000,
      '2026-10-02T03:00:00Z',
      managerId,
    );
    await movement(
      item.id,
      'RESTOCK',
      '2.5',
      333,
      '2026-10-03T03:00:00Z',
      managerId,
    );
    await movement(
      item.id,
      'USAGE',
      '-3',
      15000,
      '2026-10-04T03:00:00Z',
      managerId,
    );
    await movement(
      item.id,
      'OPENING',
      '50',
      1000,
      '2026-10-02T03:00:00Z',
      managerId,
    );
    await movement(
      item.id,
      'RESTOCK',
      '10',
      15000,
      '2026-09-02T03:00:00Z',
      managerId,
    );
  });

  const period = { from: '2026-10-01', to: '2026-10-12' };

  it('bills each owned day at the fee in effect, to the owner at the end of the day, while the horse stays at the club', async () => {
    const report = await service.ownerCost(ownerA, {
      ...period,
      ownerId: bId,
    });

    expect(report).toEqual({
      ownerId: aId,
      ownerName: 'An',
      from: '2026-10-01',
      to: '2026-10-12',
      dailyFee: 1200000,
      medicalCost: 1000000,
      surcharge: 160000,
      total: 2360000,
      prizeMoney: 0,
      horses: [
        {
          horseId: gio,
          horseName: 'Gió',
          billedDays: 5,
          dailyFee: 700000,
          caseCount: 1,
          medicalCost: 1000000,
          surcharge: 100000,
          total: 1800000,
        },
        {
          horseId: may,
          horseName: 'Mây',
          billedDays: 4,
          dailyFee: 500000,
          caseCount: 0,
          medicalCost: 0,
          surcharge: 60000,
          total: 560000,
        },
      ],
    });
  });

  it('lets the club manager read any owner, and requires the owner', async () => {
    const report = await service.ownerCost(manager, {
      ...period,
      ownerId: bId,
    });

    expect(report).toMatchObject({
      ownerName: 'Bình',
      dailyFee: 600000,
      medicalCost: 2000000,
      surcharge: 100000,
      horses: [{ horseName: 'Gió', billedDays: 3, surcharge: 100000 }],
    });
    await expect(service.ownerCost(manager, period)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(
      service.ownerCost(manager, { ...period, ownerId: randomUUID() }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('stops at the moment of reading and leaves a midnight start to the next day', async () => {
    const lan = await ownerNamed('Lan');
    const suong = await seed.horse('Sương', { ownerId: lan });
    await seed.ownership(suong, lan, '2026-10-10T17:00:00Z');
    const later = await seed.horse('Mưa', { ownerId: lan });
    await seed.ownership(later, lan, '2026-10-11T08:00:00Z');
    const repository = new FinanceReportsRepository(dataSource);
    const fees = (asOf: string) =>
      repository.dailyFees(
        {
          ...period,
          start: new Date('2026-09-30T17:00:00Z'),
          end: new Date('2026-10-12T17:00:00Z'),
        },
        new Date(asOf),
        lan,
      );

    expect(await fees('2026-10-11T05:00:00Z')).toEqual([
      {
        ownerId: lan,
        ownerName: 'Lan',
        horseId: suong,
        horseName: 'Sương',
        billedDays: 1,
        dailyFee: '200000',
      },
    ]);
    expect(await fees('2026-10-10T16:00:00Z')).toEqual([]);

    const beforeAnyFee = await repository.dailyFees(
      {
        from: '2026-10-01',
        to: '2026-10-04',
        start: new Date('2026-09-30T17:00:00Z'),
        end: new Date('2026-10-04T17:00:00Z'),
      },
      new Date('2026-10-13T00:00:00Z'),
      aId,
    );
    expect(
      beforeAnyFee
        .map((row) => [row.horseName, row.billedDays, row.dailyFee])
        .sort(),
    ).toEqual([
      ['Gió', 0, '0'],
      ['Mây', 0, '0'],
    ]);
  });

  it('sums the club charges, the supply values and each owner', async () => {
    const report = await service.clubFinance(manager, period);

    expect(report).toEqual({
      from: '2026-10-01',
      to: '2026-10-12',
      ownerCharges: {
        dailyFee: 3100000,
        medicalCost: 3300000,
        surcharge: 260000,
        total: 6660000,
      },
      supplies: { purchased: 150833, used: 45000 },
      prizeMoney: 0,
      owners: [
        {
          ownerId: aId,
          ownerName: 'An',
          dailyFee: 1200000,
          medicalCost: 1000000,
          surcharge: 160000,
          total: 2360000,
        },
        {
          ownerId: bId,
          ownerName: 'Bình',
          dailyFee: 600000,
          medicalCost: 2000000,
          surcharge: 100000,
          total: 2700000,
        },
      ],
      unowned: {
        billedDays: 8,
        dailyFee: 3 * 100000 + 5 * 200000,
        medicalCost: 300000,
        surcharge: 0,
        total: 1600000,
      },
    });
  });

  it('bills the days a horse stays at the club without owner to the unowned part, only from its creation', async () => {
    await dataSource.query(
      `UPDATE horses SET created_at = '2026-10-09T00:00:00Z' WHERE id = $1`,
      [sao],
    );
    await dataSource.query(
      `INSERT INTO horse_surcharges (version, horse_id, description, daily_amount, start_date, end_date, created_by)
       SELECT 1, $1, 'Chăm riêng', 40000, '2026-10-11', '2026-10-20', created_by FROM daily_fees LIMIT 1`,
      [sao],
    );

    const report = await service.clubFinance(manager, period);

    expect(report.unowned).toEqual({
      billedDays: 4,
      dailyFee: 4 * 200000,
      medicalCost: 300000,
      surcharge: 2 * 40000,
      total: 800000 + 300000 + 80000,
    });
    expect(report.ownerCharges).toEqual({
      dailyFee: 1800000 + 800000,
      medicalCost: 3300000,
      surcharge: 260000 + 80000,
      total: 5360000 + 800000 + 80000,
    });
    expect(report.owners.map((owner) => owner.total)).toEqual([
      2360000, 2700000,
    ]);
  });

  it('charges medical costs inside the period on the club calendar, keeps deleted profiles and skips cancelled cases', async () => {
    const lan = await ownerNamed('Lan');
    const vet = await seed.user(UserRole.VETERINARIAN);
    const suong = await seed.horse('Sương', { ownerId: lan });
    await seed.ownership(suong, lan, '2026-09-01T00:00:00Z');
    const removed = await seed.horse('Xóa', { ownerId: lan, deleted: true });
    await seed.ownership(removed, lan, '2026-09-01T00:00:00Z');
    const closed = (horseId: string, closedAt: string, totalCost: number) =>
      seed.medicalCase(horseId, vet, {
        status: MedicalCaseStatus.CLOSED,
        openedAt: '2026-09-01T00:00:00Z',
        closedAt,
        totalCost,
      });
    await closed(suong, '2026-09-30T16:59:00Z', 1);
    await closed(suong, '2026-09-30T17:00:00Z', 10);
    await closed(suong, '2026-10-12T16:59:00Z', 100);
    await closed(suong, '2026-10-12T17:00:00Z', 1000);
    await closed(removed, '2026-10-05T03:00:00Z', 10000);
    await seed.medicalCase(suong, vet, {
      status: MedicalCaseStatus.CANCELLED,
      openedAt: '2026-10-05T00:00:00Z',
      closedAt: '2026-10-06T00:00:00Z',
      totalCost: 100000,
    });

    const rows = await new FinanceReportsRepository(dataSource).medicalCharges(
      {
        ...period,
        start: new Date('2026-09-30T17:00:00Z'),
        end: new Date('2026-10-12T17:00:00Z'),
      },
      lan,
    );

    expect(rows.sort((a, b) => a.horseName.localeCompare(b.horseName))).toEqual(
      [
        {
          ownerId: lan,
          ownerName: 'Lan',
          horseId: suong,
          horseName: 'Sương',
          caseCount: 2,
          medicalCost: '110',
        },
        {
          ownerId: lan,
          ownerName: 'Lan',
          horseId: removed,
          horseName: 'Xóa',
          caseCount: 1,
          medicalCost: '10000',
        },
      ],
    );
  });
});

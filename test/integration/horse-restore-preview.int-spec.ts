import { EventEmitterModule } from '@nestjs/event-emitter';
import { Test, type TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { UserRole } from '../../src/common/enums/role.enum';
import { DomainEventsModule } from '../../src/common/infrastructure/events/domain-events.module';
import type { Actor } from '../../src/common/types/actor';
import {
  clubToday,
  shiftDays,
  toClubDate,
} from '../../src/common/utils/club-date';
import { HorseDeletionsModule } from '../../src/modules/horses/horse-deletions/horse-deletions.module';
import { HorseDeletionsService } from '../../src/modules/horses/horse-deletions/horse-deletions.service';
import { FinanceReportsRepository } from '../../src/modules/reports/finance-reports/finance-reports.repository';
import { FinanceReportsService } from '../../src/modules/reports/finance-reports/finance-reports.service';
import { fixtures } from './fixtures';
import {
  startTestPostgres,
  truncateAllTables,
  type TestPostgres,
} from './postgres';

const FEE = 100000;

describe('Horse restore preview fees (Postgres)', () => {
  let db: TestPostgres;
  let dataSource: DataSource;
  let moduleRef: TestingModule;
  let seed: ReturnType<typeof fixtures>;
  let deletions: HorseDeletionsService;
  let finance: FinanceReportsService;
  let cm: Actor;
  let today: string;

  beforeAll(async () => {
    db = await startTestPostgres();
    dataSource = db.dataSource;
    seed = fixtures(dataSource);
    moduleRef = await Test.createTestingModule({
      imports: [
        EventEmitterModule.forRoot(),
        TypeOrmModule.forRootAsync({
          useFactory: () => ({ type: 'postgres' }),
          dataSourceFactory: () => Promise.resolve(dataSource),
        }),
        DomainEventsModule,
        HorseDeletionsModule,
      ],
    }).compile();
    deletions = moduleRef.get(HorseDeletionsService);
    finance = new FinanceReportsService(
      new FinanceReportsRepository(dataSource),
      dataSource,
    );
  });

  afterAll(async () => {
    await moduleRef?.close();
    await db?.container.stop();
  });

  beforeEach(async () => {
    await truncateAllTables(dataSource);
    today = clubToday();
    const cmId = await seed.user(UserRole.CLUB_MANAGER);
    const [row] = await dataSource.query<{ keycloak_id: string }[]>(
      'SELECT keycloak_id FROM users WHERE id = $1',
      [cmId],
    );
    cm = { sub: row.keycloak_id, roles: [UserRole.CLUB_MANAGER] };
    await dataSource.query(
      `INSERT INTO daily_fees (effective_from, daily_fee, created_by) VALUES ($1, $2, $3)`,
      [shiftDays(today, -4), FEE, cmId],
    );
  });

  it('counts only days with a fee rate and puts a horse without owner into the unowned line', async () => {
    const horse = await seed.horse('Gió');
    await deletions.remove(cm, horse, { reason: 'Xóa nhầm' });
    await dataSource.query(
      `UPDATE horses SET deleted_at = now() - interval '9 days' WHERE id = $1`,
      [horse],
    );
    const [row] = await dataSource.query<{ deleted_at: Date }[]>(
      'SELECT deleted_at FROM horses WHERE id = $1',
      [horse],
    );

    const preview = await deletions.previewRestore(cm, horse);
    await deletions.restore(cm, horse, { reason: 'Khôi phục' });
    const report = await finance.clubFinance(cm, {
      from: toClubDate(row.deleted_at),
      to: today,
    });

    expect(preview).toMatchObject({
      rebilledDays: 5,
      rebilledDailyFee: 5 * FEE,
      rebilledSurcharge: 0,
      rebilledOwnerName: null,
    });
    expect(report.unowned).toMatchObject({
      billedDays: preview.rebilledDays,
      dailyFee: preview.rebilledDailyFee,
    });
    expect(preview.summary).toContain(
      'Báo cáo phí sẽ tính lại vào mục Chưa có chủ: phí ngày 5 ngày (500.000 đ).',
    );
  });
});

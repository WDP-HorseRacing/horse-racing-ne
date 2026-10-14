import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { UserRole } from '../../src/common/enums/role.enum';
import type { Actor } from '../../src/common/types/actor';
import { clubToday, shiftDays } from '../../src/common/utils/club-date';
import { AuditService } from '../../src/modules/audit/services/audit.service';
import { DailyFeesService } from '../../src/modules/billing/daily-fees/daily-fees.service';
import { DailyFeeEntity } from '../../src/modules/billing/entities/daily-fee.entity';
import { fixtures } from './fixtures';
import {
  startTestPostgres,
  stopTestPostgres,
  truncateAllTables,
  type TestPostgres,
} from './postgres';

describe('DailyFeesService (Postgres)', () => {
  let db: TestPostgres;
  let dataSource: DataSource;
  let seed: ReturnType<typeof fixtures>;
  let service: DailyFeesService;
  let manager: Actor;
  let managerId: string;

  beforeAll(async () => {
    db = await startTestPostgres();
    dataSource = db.dataSource;
    seed = fixtures(dataSource);
    service = new DailyFeesService(
      dataSource.getRepository(DailyFeeEntity),
      dataSource,
      new AuditService(),
    );
  });

  afterAll(() => stopTestPostgres(db));

  beforeEach(async () => {
    await truncateAllTables(dataSource);
    managerId = await seed.user(UserRole.CLUB_MANAGER);
    const [row] = await dataSource.query<Array<{ keycloak_id: string }>>(
      'SELECT keycloak_id FROM users WHERE id = $1',
      [managerId],
    );
    manager = { sub: row.keycloak_id, roles: [UserRole.CLUB_MANAGER] };
  });

  const insertPast = async (effectiveFrom: string, dailyFee: number) => {
    const [row] = await dataSource.query<Array<{ id: string }>>(
      `INSERT INTO daily_fees (effective_from, daily_fee, created_by)
       VALUES ($1, $2, $3) RETURNING id`,
      [effectiveFrom, dailyFee, managerId],
    );
    return row.id;
  };

  it('sets fees from today on, lists the newest first and logs each one', async () => {
    const today = clubToday();
    const later = shiftDays(today, 10);

    const first = await service.create(manager, {
      effectiveFrom: today,
      dailyFee: 300000,
    });
    await service.create(manager, { effectiveFrom: later, dailyFee: 350000 });

    expect(
      (await service.list(manager)).map((fee) => [
        fee.effectiveFrom,
        fee.dailyFee,
      ]),
    ).toEqual([
      [later, 350000],
      [today, 300000],
    ]);
    const [audit] = await dataSource.query<
      Array<{ actor_id: string; after_data: unknown; feature: string }>
    >(
      'SELECT actor_id, after_data, feature FROM audit_logs WHERE entity_id = $1',
      [first.id],
    );
    expect(audit).toEqual({
      actor_id: managerId,
      after_data: { effectiveFrom: today, dailyFee: 300000 },
      feature: 'DAILY_FEE',
    });
  });

  it('rejects a past effective date with 400 and a taken date with 409', async () => {
    const today = clubToday();

    await expect(
      service.create(manager, {
        effectiveFrom: shiftDays(today, -1),
        dailyFee: 300000,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await service.create(manager, { effectiveFrom: today, dailyFee: 300000 });
    await expect(
      service.create(manager, { effectiveFrom: today, dailyFee: 320000 }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('deletes only a fee that is not in effect yet', async () => {
    const today = clubToday();
    const future = await service.create(manager, {
      effectiveFrom: shiftDays(today, 3),
      dailyFee: 400000,
    });
    const current = await service.create(manager, {
      effectiveFrom: today,
      dailyFee: 300000,
    });
    const past = await insertPast(shiftDays(today, -30), 250000);

    await service.remove(manager, future.id);

    await expect(service.remove(manager, current.id)).rejects.toBeInstanceOf(
      ConflictException,
    );
    await expect(service.remove(manager, past)).rejects.toBeInstanceOf(
      ConflictException,
    );
    await expect(service.remove(manager, randomUUID())).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect((await service.list(manager)).map((fee) => fee.id)).toEqual([
      current.id,
      past,
    ]);
    const [audit] = await dataSource.query<
      Array<{ action: string; before_data: unknown }>
    >(
      "SELECT action, before_data FROM audit_logs WHERE entity_id = $1 AND action = 'DELETE'",
      [future.id],
    );
    expect(audit).toEqual({
      action: 'DELETE',
      before_data: { effectiveFrom: shiftDays(today, 3), dailyFee: 400000 },
    });
  });
});

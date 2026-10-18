import { ConflictException } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';
import { Test, type TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { UserRole } from '../../src/common/enums/role.enum';
import { DomainEventsModule } from '../../src/common/infrastructure/events/domain-events.module';
import type { Actor } from '../../src/common/types/actor';
import { clubToday, shiftDays } from '../../src/common/utils/club-date';
import { HorseLifecycleStatus } from '../../src/modules/horses/enums/horse-status.enum';
import { HorseStatusesModule } from '../../src/modules/horses/horse-statuses/horse-statuses.module';
import { HorseStatusesService } from '../../src/modules/horses/horse-statuses/horse-statuses.service';
import { fixtures } from './fixtures';
import {
  startTestPostgres,
  truncateAllTables,
  type TestPostgres,
} from './postgres';

describe('Horse lifecycle: sending the current status (Postgres)', () => {
  let db: TestPostgres;
  let dataSource: DataSource;
  let moduleRef: TestingModule;
  let seed: ReturnType<typeof fixtures>;
  let statuses: HorseStatusesService;
  let cm: Actor;

  const auditCount = async (horseId: string) => {
    const [row] = await dataSource.query<{ count: number }[]>(
      'SELECT COUNT(*)::int AS count FROM audit_logs WHERE entity_id = $1',
      [horseId],
    );
    return row.count;
  };

  beforeAll(async () => {
    db = await startTestPostgres();
    dataSource = db.dataSource;
    seed = fixtures(dataSource);
    moduleRef = await Test.createTestingModule({
      imports: [
        EventEmitterModule.forRoot(),
        ScheduleModule.forRoot(),
        TypeOrmModule.forRootAsync({
          useFactory: () => ({ type: 'postgres' }),
          dataSourceFactory: () => Promise.resolve(dataSource),
        }),
        DomainEventsModule,
        HorseStatusesModule,
      ],
    }).compile();
    statuses = moduleRef.get(HorseStatusesService);
  });

  afterAll(async () => {
    await moduleRef?.close();
    await db?.container.stop();
  });

  beforeEach(async () => {
    await truncateAllTables(dataSource);
    const cmId = await seed.user(UserRole.CLUB_MANAGER);
    const [row] = await dataSource.query<{ keycloak_id: string }[]>(
      'SELECT keycloak_id FROM users WHERE id = $1',
      [cmId],
    );
    cm = { sub: row.keycloak_id, roles: [UserRole.CLUB_MANAGER] };
  });

  it('rejects RETIRED -> RETIRED with 409 and writes no audit row', async () => {
    const horse = await seed.horse('Winx', {
      lifecycle: HorseLifecycleStatus.RETIRED,
    });

    await expect(
      statuses.updateLifecycle(cm, horse, {
        lifecycleStatus: HorseLifecycleStatus.RETIRED,
        reason: 'Giải nghệ lần nữa',
      }),
    ).rejects.toThrow(
      new ConflictException('Ngựa Winx đã ở trạng thái Đã giải nghệ'),
    );
    expect(await auditCount(horse)).toBe(0);
  });

  it('rejects DECEASED -> DECEASED with 409 and keeps the first date of death', async () => {
    const today = clubToday();
    const firstDate = shiftDays(today, -2);
    const horse = await seed.horse('Sương');
    await statuses.updateLifecycle(cm, horse, {
      lifecycleStatus: HorseLifecycleStatus.DECEASED,
      reason: 'Đau bụng',
      dateOfDeath: firstDate,
    });
    const auditsAfterDeath = await auditCount(horse);

    await expect(
      statuses.updateLifecycle(cm, horse, {
        lifecycleStatus: HorseLifecycleStatus.DECEASED,
        reason: 'Ghi lại ngày mất',
        dateOfDeath: shiftDays(today, -1),
      }),
    ).rejects.toThrow(
      new ConflictException('Ngựa Sương đã ở trạng thái Đã mất'),
    );

    const [row] = await dataSource.query<{ date_of_death: string }[]>(
      `SELECT to_char(date_of_death, 'YYYY-MM-DD') AS date_of_death FROM horses WHERE id = $1`,
      [horse],
    );
    expect(row.date_of_death).toBe(firstDate);
    expect(await auditCount(horse)).toBe(auditsAfterDeath);
  });
});

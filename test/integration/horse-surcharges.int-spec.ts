import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { DomainEventPublisher } from '../../src/common/infrastructure/events/domain-event.publisher';
import { UserRole } from '../../src/common/enums/role.enum';
import type { Actor } from '../../src/common/types/actor';
import { clubToday, shiftDays } from '../../src/common/utils/club-date';
import { AuditService } from '../../src/modules/audit/services/audit.service';
import { HorseSurchargeEntity } from '../../src/modules/billing/entities/horse-surcharge.entity';
import { HorseSurchargesService } from '../../src/modules/billing/horse-surcharges/horse-surcharges.service';
import { HorseLifecycleStatus } from '../../src/modules/horses/enums/horse-status.enum';
import { HorseAccessService } from '../../src/modules/horses/shared/horse-access.service';
import { fixtures } from './fixtures';
import {
  startTestPostgres,
  stopTestPostgres,
  truncateAllTables,
  type TestPostgres,
} from './postgres';

describe('Horse surcharges (Postgres)', () => {
  let db: TestPostgres;
  let dataSource: DataSource;
  let seed: ReturnType<typeof fixtures>;
  let service: HorseSurchargesService;
  let manager: Actor;
  let owner: Actor;
  let otherOwner: Actor;
  let trainer: Actor;
  let otherTrainer: Actor;
  let winx: string;

  beforeAll(async () => {
    db = await startTestPostgres();
    dataSource = db.dataSource;
    seed = fixtures(dataSource);
    service = new HorseSurchargesService(
      dataSource.getRepository(HorseSurchargeEntity),
      new HorseAccessService(dataSource),
      dataSource,
      new AuditService(),
      new DomainEventPublisher(),
    );
  });

  afterAll(() => stopTestPostgres(db));

  const actorOf = async (role: UserRole, id?: string): Promise<Actor> => {
    const userId = id ?? (await seed.user(role));
    const [row] = await dataSource.query<Array<{ keycloak_id: string }>>(
      'SELECT keycloak_id FROM users WHERE id = $1',
      [userId],
    );
    return { sub: row.keycloak_id, roles: [role] };
  };

  beforeEach(async () => {
    await truncateAllTables(dataSource);
    manager = await actorOf(UserRole.CLUB_MANAGER);
    const ownerId = await seed.user(UserRole.HORSE_OWNER);
    owner = await actorOf(UserRole.HORSE_OWNER, ownerId);
    otherOwner = await actorOf(UserRole.HORSE_OWNER);
    const trainerId = await seed.user(UserRole.HEAD_TRAINER);
    trainer = await actorOf(UserRole.HEAD_TRAINER, trainerId);
    otherTrainer = await actorOf(UserRole.HEAD_TRAINER);
    const barnId = await seed.barn('Khu A');
    await dataSource.query(
      'UPDATE barns SET head_trainer_id = $1 WHERE id = $2',
      [trainerId, barnId],
    );
    winx = await seed.horse('Winx', { barnId, ownerId });
  });

  const today = () => clubToday();
  const body = (startDate = today(), endDate = shiftDays(today(), 30)) => ({
    description: 'Thức ăn loại 1, ngâm đá mỗi ngày',
    dailyAmount: 50000,
    startDate,
    endDate,
  });

  it('records a surcharge with its audit and the event for the head trainer', async () => {
    const created = await service.create(manager, winx, body());

    expect(created).toMatchObject({
      horseId: winx,
      dailyAmount: 50000,
      description: 'Thức ăn loại 1, ngâm đá mỗi ngày',
    });
    await expect(
      dataSource.query(
        'SELECT feature, after_data FROM audit_logs WHERE entity_id = $1',
        [created.id],
      ),
    ).resolves.toEqual([
      {
        feature: 'HORSE_SURCHARGE',
        after_data: expect.objectContaining({ dailyAmount: 50000 }) as unknown,
      },
    ]);
    await expect(
      dataSource.query(
        `SELECT payload->>'horseId' AS "horseId" FROM outbox_events WHERE event_name = 'billing.surcharge.added'`,
      ),
    ).resolves.toEqual([{ horseId: winx }]);
  });

  it('refuses a past start, an end before the start, and a horse that left the club', async () => {
    await expect(
      service.create(manager, winx, body(shiftDays(today(), -1))),
    ).rejects.toThrow(BadRequestException);
    await expect(
      service.create(
        manager,
        winx,
        body(shiftDays(today(), 2), shiftDays(today(), 1)),
      ),
    ).rejects.toThrow(BadRequestException);
    const sold = await seed.horse('Đã bán', {
      lifecycle: HorseLifecycleStatus.TRANSFERRED,
    });
    await expect(service.create(manager, sold, body())).rejects.toThrow(
      new ConflictException(
        'Ngựa không còn ở câu lạc bộ, không ghi phụ phí được',
      ),
    );
  });

  it('shows the surcharges to the manager, the owner and the head trainer of the barn only', async () => {
    await service.create(manager, winx, body());

    for (const actor of [manager, owner, trainer]) {
      await expect(service.list(actor, winx)).resolves.toHaveLength(1);
    }
    await expect(service.list(otherOwner, winx)).rejects.toThrow(
      NotFoundException,
    );
    await expect(service.list(otherTrainer, winx)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('ends a running surcharge today, and deletes only one that has not started', async () => {
    const running = await service.create(manager, winx, body());
    const later = await service.create(
      manager,
      winx,
      body(shiftDays(today(), 5)),
    );

    await expect(service.end(manager, running.id)).resolves.toMatchObject({
      endDate: today(),
    });
    await expect(service.end(manager, running.id)).rejects.toThrow(
      new ConflictException('Phụ phí đã kết thúc'),
    );
    await expect(service.end(manager, later.id)).rejects.toThrow(
      ConflictException,
    );
    await expect(service.remove(manager, running.id)).rejects.toThrow(
      ConflictException,
    );
    await service.remove(manager, later.id);
    await expect(service.list(manager, winx)).resolves.toHaveLength(1);
  });

  describe('head trainer confirmation', () => {
    it('lets only the current barn head trainer confirm once, and keeps it when the horse changes barn', async () => {
      const created = await service.create(manager, winx, body());

      await expect(service.apply(otherTrainer, created.id)).rejects.toThrow(
        ForbiddenException,
      );
      const applied = await service.apply(trainer, created.id);
      expect(applied.appliedAt).toBeInstanceOf(Date);
      expect(applied.appliedByName).toEqual(expect.any(String));
      await expect(service.apply(trainer, created.id)).rejects.toThrow(
        new ConflictException('Phụ phí đã được xác nhận áp dụng'),
      );

      const barnB = await seed.barn('Khu B');
      await dataSource.query('UPDATE horses SET barn_id = $1 WHERE id = $2', [
        barnB,
        winx,
      ]);
      await expect(service.list(manager, winx)).resolves.toEqual([
        expect.objectContaining({
          id: created.id,
          appliedAt: applied.appliedAt,
        }),
      ]);
    });

    it('lists the unapplied running surcharges for the club manager, with the barn and head trainer in charge', async () => {
      const applied = await service.create(manager, winx, body());
      await service.apply(trainer, applied.id);
      const pending = await service.create(
        manager,
        winx,
        body(shiftDays(today(), 3)),
      );
      const newcomer = await seed.horse('Mới về');
      const orphan = await service.create(manager, newcomer, body());

      const rows = await service.listUnapplied(manager);

      expect(
        rows.map((row) => [
          row.id,
          row.horseName,
          row.barnName,
          row.headTrainerName === null,
        ]),
      ).toEqual([
        [orphan.id, 'Mới về', null, true],
        [pending.id, 'Winx', 'Khu A', false],
      ]);
    });
  });
});

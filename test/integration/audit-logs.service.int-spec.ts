import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import {
  startTestPostgres,
  stopTestPostgres,
  truncateAllTables,
  type TestPostgres,
} from './postgres';
import { fixtures } from './fixtures';
import { UserRole } from '../../src/common/enums/role.enum';
import type { Actor } from '../../src/common/types/actor';
import { AuditAction } from '../../src/modules/audit/constants/audit-action.enum';
import { AuditEntityType } from '../../src/modules/audit/constants/audit-entity-type.enum';
import { AuditLogEntity } from '../../src/modules/audit/entities/audit-log.entity';
import { AuditLogsService } from '../../src/modules/audit/services/audit-logs.service';

describe('AuditLogsService (Postgres)', () => {
  let db: TestPostgres;
  let dataSource: DataSource;
  let service: AuditLogsService;
  let seed: ReturnType<typeof fixtures>;
  let manager: Actor;

  beforeAll(async () => {
    db = await startTestPostgres();
    dataSource = db.dataSource;
    service = new AuditLogsService(
      dataSource.getRepository(AuditLogEntity),
      dataSource,
    );
    seed = fixtures(dataSource);
  });

  afterAll(() => stopTestPostgres(db));

  beforeEach(async () => {
    await truncateAllTables(dataSource);
    const id = await seed.user(UserRole.CLUB_MANAGER);
    const [row] = await dataSource.query<{ keycloak_id: string }[]>(
      `SELECT keycloak_id FROM users WHERE id = $1`,
      [id],
    );
    manager = {
      sub: row.keycloak_id,
      email: 'cm@test.local',
      name: 'CM',
      roles: [UserRole.CLUB_MANAGER],
    };
  });

  const log = async (
    at: string,
    options: {
      actorId?: string | null;
      action?: AuditAction;
      entityType?: AuditEntityType;
      entityId?: string;
      before?: Record<string, unknown> | null;
      after?: Record<string, unknown> | null;
    } = {},
  ): Promise<string> => {
    const [row] = await dataSource.query<{ id: string }[]>(
      `INSERT INTO audit_logs (actor_id, action, entity_type, entity_id, before_data, after_data, reason, feature, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, 'Lý do', 'HORSE_CREATE', $7)
       RETURNING id`,
      [
        options.actorId ?? null,
        options.action ?? AuditAction.UPDATE,
        options.entityType ?? AuditEntityType.HORSE,
        options.entityId ?? randomUUID(),
        options.before === undefined ? null : JSON.stringify(options.before),
        options.after === undefined ? null : JSON.stringify(options.after),
        at,
      ],
    );
    return row.id;
  };

  describe('list', () => {
    it('lists newest first with the actor, keeping deleted actors and system rows', async () => {
      const vet = await seed.user(UserRole.VETERINARIAN);
      const gone = await seed.user(UserRole.GROOM);
      await dataSource.query(
        `UPDATE users SET deleted_at = now() WHERE id = $1`,
        [gone],
      );
      const first = await log('2026-10-01T02:00:00Z', { actorId: vet });
      const second = await log('2026-10-02T02:00:00Z', { actorId: gone });
      const third = await log('2026-10-03T02:00:00Z', { actorId: null });

      const page = await service.list(manager, { page: 1, limit: 20 });

      expect(page.items.map((item) => item.id)).toEqual([third, second, first]);
      expect(page.items[0].actor).toBeNull();
      expect(page.items[1].actor).toEqual({
        id: gone,
        fullName: UserRole.GROOM,
        role: UserRole.GROOM,
      });
      expect(page.items[2]).toMatchObject({
        action: AuditAction.UPDATE,
        entityType: AuditEntityType.HORSE,
        reason: 'Lý do',
        feature: 'HORSE_CREATE',
        actor: { id: vet, role: UserRole.VETERINARIAN },
      });
      expect(page.items[2]).not.toHaveProperty('before');
      expect(page.meta).toEqual({
        total: 3,
        page: 1,
        limit: 20,
        totalPages: 1,
      });
    });

    it('filters by actor, action, entity type and entity id', async () => {
      const vet = await seed.user(UserRole.VETERINARIAN);
      const horseId = randomUUID();
      const match = await log('2026-10-01T02:00:00Z', {
        actorId: vet,
        action: AuditAction.CREATE,
        entityType: AuditEntityType.TRAINING_LOCK,
        entityId: horseId,
      });
      await log('2026-10-01T03:00:00Z', {
        action: AuditAction.CREATE,
        entityType: AuditEntityType.TRAINING_LOCK,
        entityId: horseId,
      });
      await log('2026-10-01T04:00:00Z', {
        actorId: vet,
        entityType: AuditEntityType.TRAINING_LOCK,
        entityId: horseId,
      });
      await log('2026-10-01T05:00:00Z', {
        actorId: vet,
        action: AuditAction.CREATE,
        entityId: horseId,
      });
      await log('2026-10-01T06:00:00Z', {
        actorId: vet,
        action: AuditAction.CREATE,
        entityType: AuditEntityType.TRAINING_LOCK,
      });

      const page = await service.list(manager, {
        page: 1,
        limit: 20,
        actorId: vet,
        action: AuditAction.CREATE,
        entityType: AuditEntityType.TRAINING_LOCK,
        entityId: horseId,
      });

      expect(page.items.map((item) => item.id)).toEqual([match]);
    });

    it('takes both ends of the date range on the club calendar', async () => {
      await log('2026-09-30T16:59:00Z');
      const startOfFirst = await log('2026-09-30T17:00:00Z');
      const endOfFirst = await log('2026-10-01T16:59:00Z');
      const startOfSecond = await log('2026-10-01T17:00:00Z');

      const ids = async (from?: string, to?: string) =>
        (
          await service.list(manager, { page: 1, limit: 20, from, to })
        ).items.map((item) => item.id);

      await expect(ids('2026-10-01', '2026-10-01')).resolves.toEqual([
        endOfFirst,
        startOfFirst,
      ]);
      await expect(ids('2026-10-02')).resolves.toEqual([startOfSecond]);
    });

    it('pages with the total of every matching row', async () => {
      const ids = [];
      for (let day = 1; day <= 5; day++) {
        ids.push(await log(`2026-10-0${day}T02:00:00Z`));
      }

      const page = await service.list(manager, { page: 2, limit: 2 });

      expect(page.items.map((item) => item.id)).toEqual([ids[2], ids[1]]);
      expect(page.meta).toEqual({ total: 5, page: 2, limit: 2, totalPages: 3 });
    });

    it('rejects a range that starts after it ends', async () => {
      await expect(
        service.list(manager, {
          page: 1,
          limit: 20,
          from: '2026-10-02',
          to: '2026-10-01',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  it('rejects a caller whose account is no longer active', async () => {
    await dataSource.query(
      `UPDATE users SET status = 'INACTIVE' WHERE keycloak_id = $1`,
      [manager.sub],
    );

    await expect(service.list(manager, { page: 1, limit: 20 })).rejects.toThrow(
      ForbiddenException,
    );
    await expect(service.get(manager, randomUUID())).rejects.toThrow(
      ForbiddenException,
    );
  });

  describe('get', () => {
    it('returns the row with its data before and after', async () => {
      const vet = await seed.user(UserRole.VETERINARIAN);
      const id = await log('2026-10-01T02:00:00Z', {
        actorId: vet,
        before: { healthStatus: 'ELIGIBLE' },
        after: { healthStatus: 'INJURED' },
      });

      await expect(service.get(manager, id)).resolves.toMatchObject({
        id,
        actor: { id: vet },
        before: { healthStatus: 'ELIGIBLE' },
        after: { healthStatus: 'INJURED' },
      });
    });

    it('answers 404 for an unknown id', async () => {
      await expect(service.get(manager, randomUUID())).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});

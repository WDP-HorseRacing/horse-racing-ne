import { BadRequestException, ConflictException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { UserRole } from '../../src/common/enums/role.enum';
import type { Actor } from '../../src/common/types/actor';
import { AuditService } from '../../src/modules/audit/services/audit.service';
import {
  HORSE_OWNERSHIP_TRANSFERRED_EVENT,
  STALE_HORSE_MESSAGE,
} from '../../src/modules/horses/constants/horse.constants';
import { HorseOwnershipEntity } from '../../src/modules/horses/entities/horse-ownership.entity';
import { HorseLifecycleStatus } from '../../src/modules/horses/enums/horse-status.enum';
import { HorseOwnershipsService } from '../../src/modules/horses/horse-ownerships/horse-ownerships.service';
import { HorseAccessService } from '../../src/modules/horses/shared/horse-access.service';
import { HorseOwnershipService } from '../../src/modules/horses/shared/horse-ownership.service';
import { MedicalCaseStatus } from '../../src/modules/medical/constants/medical-case.enum';
import { MedicalAccessService } from '../../src/modules/medical/shared/medical-access.service';
import { clubToday } from '../../src/common/utils/club-date';
import { fixtures } from './fixtures';
import {
  startTestPostgres,
  stopTestPostgres,
  truncateAllTables,
  type TestPostgres,
} from './postgres';

describe('HorseOwnershipsService (Postgres)', () => {
  let db: TestPostgres;
  let dataSource: DataSource;
  let seed: ReturnType<typeof fixtures>;
  let publish: jest.Mock;
  let service: HorseOwnershipsService;

  const actorOf = async (userId: string, role: UserRole): Promise<Actor> => {
    const [row] = await dataSource.query<{ keycloak_id: string }[]>(
      'SELECT keycloak_id FROM users WHERE id = $1',
      [userId],
    );
    return { sub: row.keycloak_id, roles: [role] };
  };

  const horseRow = async (id: string) =>
    (
      await dataSource.query<{ owner_id: string | null; version: number }[]>(
        'SELECT owner_id, version FROM horses WHERE id = $1',
        [id],
      )
    )[0];

  beforeAll(async () => {
    db = await startTestPostgres();
    dataSource = db.dataSource;
    seed = fixtures(dataSource);
    const access = new HorseAccessService(dataSource);
    publish = jest.fn().mockResolvedValue(undefined);
    service = new HorseOwnershipsService(
      dataSource.getRepository(HorseOwnershipEntity),
      access,
      new HorseOwnershipService(),
      new MedicalAccessService(access, dataSource),
      dataSource,
      new AuditService(),
      { publish },
    );
  });

  afterAll(() => stopTestPostgres(db));

  beforeEach(async () => {
    await truncateAllTables(dataSource);
    publish.mockClear();
  });

  const setupHorse = async () => {
    const cm = await seed.user(UserRole.CLUB_MANAGER);
    const a = await seed.user(UserRole.HORSE_OWNER);
    const b = await seed.user(UserRole.HORSE_OWNER);
    const horse = await seed.horse('Winx', { ownerId: a });
    await dataSource.query(
      `INSERT INTO horse_ownerships (horse_id, owner_id, effective_date, started_at, version)
       VALUES ($1, $2, '2026-01-01', '2026-01-01T03:00:00Z', 1)`,
      [horse, a],
    );
    return { cm, a, b, horse, actor: await actorOf(cm, UserRole.CLUB_MANAGER) };
  };

  it('moves the owner, closes the old period, opens the new one and writes the event', async () => {
    const { cm, a, b, horse, actor } = await setupHorse();

    const result = await service.transfer(actor, horse, {
      newOwnerId: b,
      effectiveDate: '2026-06-01',
      reason: 'HĐ 12',
      version: 1,
    });

    expect(result).toMatchObject({ ownerId: b, version: 2 });
    expect(await horseRow(horse)).toEqual({ owner_id: b, version: 2 });
    const history = await service.history(actor, horse);
    expect(history).toEqual([
      expect.objectContaining({
        owner: expect.objectContaining({ id: b }) as unknown,
        effectiveDate: '2026-06-01',
        endDate: null,
        reason: 'HĐ 12',
        recordedBy: expect.objectContaining({ id: cm }) as unknown,
      }),
      expect.objectContaining({
        owner: expect.objectContaining({ id: a }) as unknown,
        effectiveDate: '2026-01-01',
        endDate: '2026-06-01',
        recordedBy: null,
      }),
    ]);
    expect(publish).toHaveBeenCalledWith(
      expect.anything(),
      HORSE_OWNERSHIP_TRANSFERRED_EVENT,
      expect.objectContaining({
        horseId: horse,
        fromOwnerId: a,
        toOwnerId: b,
        effectiveDate: '2026-06-01',
      }),
    );
    const audit = await dataSource.query<unknown[]>(
      'SELECT before_data AS before, after_data AS after, reason, feature FROM audit_logs WHERE entity_id = $1',
      [horse],
    );
    expect(audit).toEqual([
      {
        before: { ownerId: a },
        after: { ownerId: b, effectiveDate: '2026-06-01' },
        reason: 'HĐ 12',
        feature: 'F1.4',
      },
    ]);
  });

  it('shows a horse owner only their own periods', async () => {
    const { a, b, horse, actor } = await setupHorse();
    await service.transfer(actor, horse, {
      newOwnerId: b,
      effectiveDate: '2026-06-01',
      reason: 'HĐ 12',
      version: 1,
    });

    const ownerHistory = await service.history(
      await actorOf(b, UserRole.HORSE_OWNER),
      horse,
    );
    expect(ownerHistory.map((row) => row.owner.id)).toEqual([b]);
    await expect(
      service.history(await actorOf(a, UserRole.HORSE_OWNER), horse),
    ).rejects.toThrow('Không tìm thấy ngựa');
  });

  it('blocks a horse with an open medical case and changes nothing', async () => {
    const { b, horse, actor } = await setupHorse();
    const vet = await seed.user(UserRole.VETERINARIAN);
    await seed.medicalCase(horse, vet, { status: MedicalCaseStatus.OPEN });

    await expect(
      service.transfer(actor, horse, {
        newOwnerId: b,
        effectiveDate: '2026-06-01',
        reason: 'HĐ 12',
        version: 1,
      }),
    ).rejects.toThrow(
      new ConflictException(
        'Ngựa còn bệnh án đang điều trị, bác sĩ cần đóng bệnh án trước khi chuyển chủ',
      ),
    );
    expect((await horseRow(horse)).version).toBe(1);
    expect(publish).not.toHaveBeenCalled();
  });

  it('rejects a stale version and a second concurrent transfer keeps one open period', async () => {
    const { b, horse, actor } = await setupHorse();
    const c = await seed.user(UserRole.HORSE_OWNER);
    const results = await Promise.allSettled([
      service.transfer(actor, horse, {
        newOwnerId: b,
        effectiveDate: '2026-06-01',
        reason: 'Lần 1',
        version: 1,
      }),
      service.transfer(actor, horse, {
        newOwnerId: c,
        effectiveDate: '2026-06-01',
        reason: 'Lần 2',
        version: 1,
      }),
    ]);

    expect(results.map((r) => r.status).sort()).toEqual([
      'fulfilled',
      'rejected',
    ]);
    const rejected = results.find((r) => r.status === 'rejected');
    expect((rejected as PromiseRejectedResult).reason).toEqual(
      new ConflictException(STALE_HORSE_MESSAGE),
    );
    const open = await dataSource.query<{ n: number }[]>(
      'SELECT count(*)::int AS n FROM horse_ownerships WHERE horse_id = $1 AND ended_at IS NULL',
      [horse],
    );
    expect(open[0].n).toBe(1);
  });

  it('rejects a deceased horse, a horse without owner and a future date', async () => {
    const { b, horse, actor } = await setupHorse();
    await expect(
      service.transfer(actor, horse, {
        newOwnerId: b,
        effectiveDate: '2999-01-01',
        reason: 'HĐ',
        version: 1,
      }),
    ).rejects.toThrow(
      new BadRequestException('Ngày hiệu lực không được ở tương lai'),
    );
    await dataSource.query(
      'UPDATE horses SET lifecycle_status = $2 WHERE id = $1',
      [horse, HorseLifecycleStatus.DECEASED],
    );
    await expect(
      service.transfer(actor, horse, {
        newOwnerId: b,
        effectiveDate: clubToday(),
        reason: 'HĐ',
        version: 1,
      }),
    ).rejects.toThrow(
      new ConflictException('Chỉ chuyển chủ được cho ngựa đang ở câu lạc bộ'),
    );
    const ownerless = await seed.horse('Mây');
    await expect(
      service.transfer(actor, ownerless, {
        newOwnerId: b,
        effectiveDate: clubToday(),
        reason: 'HĐ',
        version: 1,
      }),
    ).rejects.toThrow(
      new ConflictException(
        'Ngựa chưa có chủ sở hữu, dùng Gán chủ thay cho chuyển nhượng',
      ),
    );
  });
});

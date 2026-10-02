import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { UserRole } from '../../src/common/enums/role.enum';
import { SortOrder } from '../../src/common/enums/sort-order.enum';
import { HorseListQueryDto } from '../../src/modules/horses/dto';
import { HorseEntity } from '../../src/modules/horses/entities/horse.entity';
import { HorseListSortBy } from '../../src/modules/horses/enums/horse-list-sort.enum';
import { HorsePlacementStatus } from '../../src/modules/horses/enums/horse-placement-status.enum';
import {
  HorseHealthStatus,
  HorseLifecycleStatus,
} from '../../src/modules/horses/enums/horse-status.enum';
import { HorseProfilesRepository } from '../../src/modules/horses/horse-profiles/horse-profiles.repository';
import type { HorseScope } from '../../src/modules/horses/types/horse.types';
import { fixtures } from './fixtures';
import {
  startTestDatabase,
  stopTestDatabase,
  truncateAll,
  type TestDatabase,
} from './postgres';

const ALL: HorseScope = { kind: 'ALL' };

describe('HorseProfilesRepository.list (Postgres)', () => {
  let db: TestDatabase;
  let dataSource: DataSource;
  let seed: ReturnType<typeof fixtures>;
  let repository: HorseProfilesRepository;
  let caller: string;

  beforeAll(async () => {
    db = await startTestDatabase();
    dataSource = db.dataSource;
    seed = fixtures(dataSource);
    repository = new HorseProfilesRepository(
      dataSource.getRepository(HorseEntity),
      dataSource,
    );
  });

  afterAll(() => stopTestDatabase(db));

  beforeEach(async () => {
    await truncateAll(dataSource);
    caller = await seed.user(UserRole.HEAD_TRAINER);
  });

  const names = async (
    patch: Partial<HorseListQueryDto>,
    scope: HorseScope = ALL,
  ): Promise<string[]> => {
    const [rows] = await repository.list(
      scope,
      caller,
      Object.assign(new HorseListQueryDto(), patch),
    );
    return rows.map((row) => row.name);
  };

  const barnLedBy = async (name: string, trainerId: string | null) => {
    const barn = await seed.barn(name);
    await dataSource.query(
      'UPDATE barns SET head_trainer_id = $2 WHERE id = $1',
      [barn, trainerId],
    );
    return barn;
  };

  const groomAssignment = (horseId: string, groomId: string, ended: boolean) =>
    dataSource.query(
      `INSERT INTO groom_assignments (id, version, horse_id, groom_id, start_at, end_at)
       VALUES ($1, 1, $2, $3, now(), $4)`,
      [randomUUID(), horseId, groomId, ended ? new Date() : null],
    );

  describe('myBarns', () => {
    it('keeps only horses in live barns led by the caller', async () => {
      const other = await seed.user(UserRole.HEAD_TRAINER);
      const mine = await barnLedBy('Khu A', caller);
      const mine2 = await barnLedBy('Khu B', caller);
      const theirs = await barnLedBy('Khu C', other);
      const deletedBarn = await barnLedBy('Khu D', caller);
      await seed.horse('An', { barnId: mine });
      await seed.horse('Bình', { barnId: mine2 });
      await seed.horse('Cường', { barnId: theirs });
      await seed.horse('Dũng', { barnId: deletedBarn });
      await seed.horse('Em');
      await seed.horse('Giang', { barnId: mine, deleted: true });
      await dataSource.query(
        'UPDATE barns SET deleted_at = now() WHERE id = $1',
        [deletedBarn],
      );

      await expect(
        names({ myBarns: true, sortBy: HorseListSortBy.NAME }),
      ).resolves.toEqual(['An', 'Bình']);
      await expect(
        names({
          myBarns: true,
          includeDeleted: true,
          sortBy: HorseListSortBy.NAME,
        }),
      ).resolves.toEqual(['An', 'Bình', 'Giang']);
    });
  });

  describe('myHorses', () => {
    it('keeps only horses the caller grooms through an open assignment', async () => {
      const otherGroom = await seed.user(UserRole.GROOM);
      const open = await seed.horse('An');
      const ended = await seed.horse('Bình');
      const theirs = await seed.horse('Cường');
      const twice = await seed.horse('Dũng');
      const deleted = await seed.horse('Em', { deleted: true });
      await groomAssignment(open, caller, false);
      await groomAssignment(ended, caller, true);
      await groomAssignment(theirs, otherGroom, false);
      await groomAssignment(twice, caller, true);
      await groomAssignment(twice, caller, false);
      await groomAssignment(deleted, caller, false);

      await expect(
        names({ myHorses: true, sortBy: HorseListSortBy.NAME }),
      ).resolves.toEqual(['An', 'Dũng']);
      const [, total] = await repository.list(
        ALL,
        caller,
        Object.assign(new HorseListQueryDto(), { myHorses: true }),
      );
      expect(total).toBe(2);
    });
  });

  it('combines myBarns and myHorses with the other filters and the owner scope', async () => {
    const owner = await seed.user(UserRole.HORSE_OWNER);
    const barn = await barnLedBy('Khu A', caller);
    const both = await seed.horse('An', { barnId: barn, ownerId: owner });
    const barnOnly = await seed.horse('Bình', { barnId: barn });
    await groomAssignment(both, caller, false);
    await groomAssignment(barnOnly, caller, true);

    await expect(names({ myBarns: true, myHorses: true })).resolves.toEqual([
      'An',
    ]);
    await expect(
      names({ myBarns: true }, { kind: 'OWNER', userId: owner }),
    ).resolves.toEqual(['An']);
  });

  it('searches the name without accents and the microchip by substring', async () => {
    await seed.horse('Gió Bấc');
    await seed.horse('Mây');
    await dataSource.query(
      "UPDATE horses SET microchip_id = 'VN-123-XYZ' WHERE name = 'Mây'",
    );

    await expect(names({ search: 'gio bac' })).resolves.toEqual(['Gió Bấc']);
    await expect(names({ search: '123' })).resolves.toEqual(['Mây']);
  });

  it('filters by placement status', async () => {
    const barn = await barnLedBy('Khu A', caller);
    await seed.horse('Chờ khu');
    await seed.horse('Chờ ô', { barnId: barn });
    await seed.horse('Đã đi', {
      barnId: barn,
      lifecycle: HorseLifecycleStatus.TRANSFERRED,
    });

    await expect(
      names({ placementStatus: HorsePlacementStatus.PENDING_BARN }),
    ).resolves.toEqual(['Chờ khu']);
    await expect(
      names({ placementStatus: HorsePlacementStatus.PENDING_STALL }),
    ).resolves.toEqual(['Chờ ô']);
    await expect(
      names({ placementStatus: HorsePlacementStatus.NOT_APPLICABLE }),
    ).resolves.toEqual(['Đã đi']);
  });

  it('sorts by health priority then Vietnamese name, and pages with a total', async () => {
    await seed.horse('Bình', { health: HorseHealthStatus.ELIGIBLE });
    await seed.horse('Ánh', { health: HorseHealthStatus.UNDER_OBSERVATION });
    await seed.horse('Cường', { health: HorseHealthStatus.QUARANTINED });
    await seed.horse('An', { health: HorseHealthStatus.INJURED });

    await expect(names({})).resolves.toEqual(['An', 'Cường', 'Ánh', 'Bình']);
    await expect(
      names({ sortBy: HorseListSortBy.NAME, sortOrder: SortOrder.DESC }),
    ).resolves.toEqual(['Cường', 'Bình', 'Ánh', 'An']);
    const [rows, total] = await repository.list(
      ALL,
      caller,
      Object.assign(new HorseListQueryDto(), { page: 2, limit: 3 }),
    );
    expect(rows.map((row) => row.name)).toEqual(['Bình']);
    expect(total).toBe(4);
  });

  describe('locationsByHorseIds', () => {
    const stall = async (barnId: string, code: string): Promise<string> => {
      const id = randomUUID();
      await dataSource.query(
        `INSERT INTO stalls (id, version, barn_id, code) VALUES ($1, 1, $2, $3)`,
        [id, barnId, code],
      );
      return id;
    };

    const stallAssignment = (
      horseId: string,
      stallId: string,
      ended: boolean,
    ) =>
      dataSource.query(
        `INSERT INTO stall_assignments (id, version, horse_id, stall_id, start_at, end_at)
         VALUES ($1, 1, $2, $3, now(), $4)`,
        [randomUUID(), horseId, stallId, ended ? new Date() : null],
      );

    const softDelete = (table: 'barns' | 'stalls', id: string) =>
      dataSource.query(`UPDATE ${table} SET deleted_at = now() WHERE id = $1`, [
        id,
      ]);

    it('returns one row per horse with its live barn and open stall, deleted horses included', async () => {
      const barn = await barnLedBy('Khu A', caller);
      const goneBarn = await barnLedBy('Khu B', caller);
      const a01 = await stall(barn, 'A-01');
      const a02 = await stall(barn, 'A-02');
      const goneStall = await stall(barn, 'A-03');
      const placed = await seed.horse('An', { barnId: barn });
      const moved = await seed.horse('Bình', { barnId: barn });
      const noPlace = await seed.horse('Cường');
      const inGoneBarn = await seed.horse('Dũng', { barnId: goneBarn });
      const inGoneStall = await seed.horse('Em', { barnId: barn });
      const deletedHorse = await seed.horse('Giang', {
        barnId: barn,
        deleted: true,
      });
      await stallAssignment(placed, a01, false);
      await stallAssignment(moved, a01, true);
      await stallAssignment(moved, a02, false);
      await stallAssignment(inGoneStall, goneStall, false);
      await stallAssignment(deletedHorse, a02, true);
      await softDelete('barns', goneBarn);
      await softDelete('stalls', goneStall);

      const rows = await repository.locationsByHorseIds([
        placed,
        moved,
        noPlace,
        inGoneBarn,
        inGoneStall,
        deletedHorse,
      ]);
      const byHorse = new Map(rows.map((row) => [row.horseId, row]));

      expect(rows).toHaveLength(6);
      expect(byHorse.get(placed)).toEqual({
        horseId: placed,
        barnId: barn,
        barnName: 'Khu A',
        stallId: a01,
        stallCode: 'A-01',
      });
      expect(byHorse.get(moved)).toMatchObject({
        stallId: a02,
        stallCode: 'A-02',
      });
      expect(byHorse.get(noPlace)).toEqual({
        horseId: noPlace,
        barnId: null,
        barnName: null,
        stallId: null,
        stallCode: null,
      });
      expect(byHorse.get(inGoneBarn)).toMatchObject({
        barnId: null,
        barnName: null,
      });
      expect(byHorse.get(inGoneStall)).toMatchObject({
        barnId: barn,
        stallId: null,
        stallCode: null,
      });
      expect(byHorse.get(deletedHorse)).toMatchObject({
        barnId: barn,
        barnName: 'Khu A',
        stallId: null,
      });
      expect(await repository.locationsByHorseIds([])).toEqual([]);
    });
  });
});

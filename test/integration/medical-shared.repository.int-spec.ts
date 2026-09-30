import { DataSource } from 'typeorm';
import {
  startTestDatabase,
  stopTestDatabase,
  truncateAll,
  type TestDatabase,
} from './postgres';
import { fixtures } from './fixtures';
import { UserRole } from '../../src/common/enums/role.enum';
import { UserStatus } from '../../src/common/enums/user-status.enum';
import {
  HorseHealthStatus,
  HorseLifecycleStatus,
} from '../../src/modules/horses/enums/horse-status.enum';
import {
  CareScheduleStatus,
  CareScheduleType,
} from '../../src/modules/medical/constants/care-schedule.enum';
import { MedicalSharedRepository } from '../../src/modules/medical/shared/medical-shared.repository';

const TODAY = '2026-09-27';

describe('MedicalSharedRepository (Postgres)', () => {
  let db: TestDatabase;
  let dataSource: DataSource;
  let repository: MedicalSharedRepository;
  let seed: ReturnType<typeof fixtures>;

  beforeAll(async () => {
    db = await startTestDatabase();
    dataSource = db.dataSource;
    repository = new MedicalSharedRepository(dataSource);
    seed = fixtures(dataSource);
  });

  afterAll(() => stopTestDatabase(db));

  beforeEach(() => truncateAll(dataSource));

  describe('dueCareSchedules', () => {
    const scheduleIds = async (horseIds?: string[]) =>
      (await repository.dueCareSchedules(TODAY, horseIds)).map(
        (row) => row.scheduleId,
      );

    it('takes schedules due up to today on the club calendar', async () => {
      const horse = await seed.horse('Winx');
      const earlier = await seed.schedule(horse, '2026-09-20T02:00:00Z');
      const lateToday = await seed.schedule(horse, '2026-09-27T16:30:00Z');
      await seed.schedule(horse, '2026-09-27T17:30:00Z');

      const rows = await repository.dueCareSchedules(TODAY);

      expect(rows.map((row) => row.scheduleId)).toEqual([earlier, lateToday]);
      expect(rows[1]).toMatchObject({ horseName: 'Winx', dueDate: TODAY });
    });

    it('skips deleted and transferred horses but keeps retired ones', async () => {
      const retired = await seed.horse('Retired', {
        lifecycle: HorseLifecycleStatus.RETIRED,
      });
      const deleted = await seed.horse('Deleted', { deleted: true });
      const transferred = await seed.horse('Transferred', {
        lifecycle: HorseLifecycleStatus.TRANSFERRED,
      });
      const kept = await seed.schedule(retired, '2026-09-26T02:00:00Z');
      await seed.schedule(deleted, '2026-09-26T02:00:00Z');
      await seed.schedule(transferred, '2026-09-26T02:00:00Z');

      await expect(scheduleIds()).resolves.toEqual([kept]);
    });

    it('skips closed schedules and routine checkup appointments', async () => {
      const horse = await seed.horse('Winx');
      const kept = await seed.schedule(horse, '2026-09-26T02:00:00Z');
      await seed.schedule(horse, '2026-09-26T03:00:00Z', {
        status: CareScheduleStatus.COMPLETED,
      });
      await seed.schedule(horse, '2026-09-26T04:00:00Z', {
        status: CareScheduleStatus.CANCELLED,
      });
      await seed.schedule(horse, '2026-09-26T05:00:00Z', {
        type: CareScheduleType.ROUTINE_CHECKUP,
      });

      await expect(scheduleIds()).resolves.toEqual([kept]);
    });

    it('keeps only an assignee who is still valid', async () => {
      const horse = await seed.horse('Winx');
      const vet = await seed.user(UserRole.VETERINARIAN);
      const inactiveVet = await seed.user(
        UserRole.VETERINARIAN,
        UserStatus.INACTIVE,
      );
      const groom = await seed.user(UserRole.GROOM);
      const formerGroom = await seed.user(UserRole.GROOM);
      await dataSource.query(
        `INSERT INTO groom_assignments (version, horse_id, groom_id, start_at, end_at)
         VALUES (1, $1, $2, '2026-09-01', NULL), (1, $1, $3, '2026-08-01', '2026-09-01')`,
        [horse, groom, formerGroom],
      );
      for (const [hour, assignee] of [
        [1, vet],
        [2, inactiveVet],
        [3, groom],
        [4, formerGroom],
      ] as const) {
        await seed.schedule(horse, `2026-09-26T0${hour}:00:00Z`, {
          assignedTo: assignee,
        });
      }

      const rows = await repository.dueCareSchedules(TODAY);

      expect(rows.map((row) => row.assignedTo)).toEqual([
        vet,
        null,
        groom,
        null,
      ]);
    });

    it('limits the result to the given horses', async () => {
      const winx = await seed.horse('Winx');
      const other = await seed.horse('Other');
      const kept = await seed.schedule(winx, '2026-09-26T02:00:00Z');
      await seed.schedule(other, '2026-09-26T02:00:00Z');

      await expect(scheduleIds([winx])).resolves.toEqual([kept]);
    });
  });

  describe('herdCheckupAnchors', () => {
    it('lists active and retired horses, never deleted or transferred ones', async () => {
      await seed.horse('Active');
      await seed.horse('Retired', { lifecycle: HorseLifecycleStatus.RETIRED });
      await seed.horse('Deleted', { deleted: true });
      await seed.horse('Transferred', {
        lifecycle: HorseLifecycleStatus.TRANSFERRED,
      });

      const rows = await repository.herdCheckupAnchors();

      expect(rows.map((row) => row.horseName)).toEqual(['Active', 'Retired']);
    });

    it('filters the herd by barn and health status for the dashboard', async () => {
      const east = await seed.barn('Khu Đông');
      const west = await seed.barn('Khu Tây');
      await seed.horse('East injured', {
        barnId: east,
        health: HorseHealthStatus.INJURED,
      });
      await seed.horse('East ok', { barnId: east });
      await seed.horse('West injured', {
        barnId: west,
        health: HorseHealthStatus.INJURED,
      });

      const names = async (
        filter: Parameters<typeof repository.herdCheckupAnchors>[0],
      ) =>
        (await repository.herdCheckupAnchors(filter)).map(
          (row) => row.horseName,
        );

      await expect(names({ barnId: east })).resolves.toEqual([
        'East injured',
        'East ok',
      ]);
      await expect(
        names({ healthStatus: HorseHealthStatus.INJURED }),
      ).resolves.toEqual(['East injured', 'West injured']);
      await expect(
        names({ barnId: east, healthStatus: HorseHealthStatus.INJURED }),
      ).resolves.toEqual(['East injured']);
    });

    it('takes the latest visit that was not voided, on the club calendar', async () => {
      const horse = await seed.horse('Winx');
      const vet = await seed.user(UserRole.VETERINARIAN);
      await seed.visit(horse, vet, '2026-09-10T02:00:00Z');
      await seed.visit(horse, vet, '2026-09-20T18:00:00Z');
      await seed.visit(horse, vet, '2026-09-25T02:00:00Z', { voided: true });

      const [row] = await repository.herdCheckupAnchors();

      expect(row).toMatchObject({
        lastVisitDate: '2026-09-21',
        createdDate: '2026-01-01',
      });
    });

    it('takes the latest reactivation, even when the horse retired again later', async () => {
      const horse = await seed.horse('Winx', {
        lifecycle: HorseLifecycleStatus.RETIRED,
      });
      await seed.lifecycleAudit(
        horse,
        HorseLifecycleStatus.RETIRED,
        HorseLifecycleStatus.ACTIVE,
        '2026-05-01T02:00:00Z',
      );
      await seed.lifecycleAudit(
        horse,
        HorseLifecycleStatus.RETIRED,
        HorseLifecycleStatus.ACTIVE,
        '2026-08-01T02:00:00Z',
      );
      await seed.lifecycleAudit(
        horse,
        HorseLifecycleStatus.ACTIVE,
        HorseLifecycleStatus.RETIRED,
        '2026-09-01T02:00:00Z',
      );
      await seed.lifecycleAudit(
        horse,
        HorseLifecycleStatus.ACTIVE,
        HorseLifecycleStatus.ACTIVE,
        '2026-09-10T02:00:00Z',
      );

      const [row] = await repository.herdCheckupAnchors();

      expect(row).toMatchObject({
        lastVisitDate: null,
        reactivatedDate: '2026-08-01',
      });
    });
  });
});

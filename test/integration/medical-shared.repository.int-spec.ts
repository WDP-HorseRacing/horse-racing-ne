import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import {
  startTestDatabase,
  stopTestDatabase,
  truncateAll,
  type TestDatabase,
} from './postgres';
import { UserRole } from '../../src/common/enums/role.enum';
import { UserStatus } from '../../src/common/enums/user-status.enum';
import { AuditEntityType } from '../../src/modules/audit/constants/audit-entity-type.enum';
import { HorseLifecycleStatus } from '../../src/modules/horses/enums/horse-status.enum';
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

  const insertUser = async (
    role: UserRole,
    status: UserStatus = UserStatus.ACTIVE,
  ): Promise<string> => {
    const id = randomUUID();
    await dataSource.query(
      `INSERT INTO users (id, version, keycloak_id, full_name, email, role, status)
       VALUES ($1, 1, $2, $3, $4, $5, $6)`,
      [id, randomUUID(), role, `${id}@test.local`, role, status],
    );
    return id;
  };

  const insertHorse = async (
    name: string,
    options: {
      lifecycle?: HorseLifecycleStatus;
      deleted?: boolean;
      createdAt?: string;
    } = {},
  ): Promise<string> => {
    const id = randomUUID();
    await dataSource.query(
      `INSERT INTO horses (id, version, name, lifecycle_status, deleted_at, created_at)
       VALUES ($1, 1, $2, $3, $4, $5)`,
      [
        id,
        name,
        options.lifecycle ?? HorseLifecycleStatus.ACTIVE,
        options.deleted ? new Date() : null,
        options.createdAt ?? '2026-01-01T03:00:00Z',
      ],
    );
    return id;
  };

  const insertSchedule = async (
    horseId: string,
    dueAt: string,
    options: {
      type?: CareScheduleType;
      status?: CareScheduleStatus;
      assignedTo?: string | null;
    } = {},
  ): Promise<string> => {
    const id = randomUUID();
    await dataSource.query(
      `INSERT INTO care_schedules (id, version, horse_id, type, due_at, status, assigned_to)
       VALUES ($1, 1, $2, $3, $4, $5, $6)`,
      [
        id,
        horseId,
        options.type ?? CareScheduleType.FARRIER,
        dueAt,
        options.status ?? CareScheduleStatus.SCHEDULED,
        options.assignedTo ?? null,
      ],
    );
    return id;
  };

  const insertVisit = async (
    horseId: string,
    vetId: string,
    examDate: string,
    voided = false,
  ): Promise<void> => {
    await dataSource.query(
      `INSERT INTO medical_records (horse_id, vet_id, exam_date, resulting_status, kind, voided_at)
       VALUES ($1, $2, $3, 'ELIGIBLE', 'ROUTINE', $4)`,
      [horseId, vetId, examDate, voided ? new Date() : null],
    );
  };

  const insertLifecycleAudit = async (
    horseId: string,
    from: HorseLifecycleStatus,
    to: HorseLifecycleStatus,
    at: string,
  ): Promise<void> => {
    await dataSource.query(
      `INSERT INTO audit_logs (action, entity_type, entity_id, before_data, after_data, created_at)
       VALUES ('UPDATE', $1, $2, $3, $4, $5)`,
      [
        AuditEntityType.HORSE,
        horseId,
        JSON.stringify({ lifecycleStatus: from }),
        JSON.stringify({ lifecycleStatus: to }),
        at,
      ],
    );
  };

  beforeAll(async () => {
    db = await startTestDatabase();
    dataSource = db.dataSource;
    repository = new MedicalSharedRepository(dataSource);
  });

  afterAll(() => stopTestDatabase(db));

  beforeEach(() => truncateAll(dataSource));

  describe('dueCareSchedules', () => {
    const scheduleIds = async (horseIds?: string[]) =>
      (await repository.dueCareSchedules(TODAY, horseIds)).map(
        (row) => row.scheduleId,
      );

    it('takes schedules due up to today on the club calendar', async () => {
      const horse = await insertHorse('Winx');
      const earlier = await insertSchedule(horse, '2026-09-20T02:00:00Z');
      const lateToday = await insertSchedule(horse, '2026-09-27T16:30:00Z');
      await insertSchedule(horse, '2026-09-27T17:30:00Z');

      const rows = await repository.dueCareSchedules(TODAY);

      expect(rows.map((row) => row.scheduleId)).toEqual([earlier, lateToday]);
      expect(rows[1]).toMatchObject({ horseName: 'Winx', dueDate: TODAY });
    });

    it('skips deleted and transferred horses but keeps retired ones', async () => {
      const retired = await insertHorse('Retired', {
        lifecycle: HorseLifecycleStatus.RETIRED,
      });
      const deleted = await insertHorse('Deleted', { deleted: true });
      const transferred = await insertHorse('Transferred', {
        lifecycle: HorseLifecycleStatus.TRANSFERRED,
      });
      const kept = await insertSchedule(retired, '2026-09-26T02:00:00Z');
      await insertSchedule(deleted, '2026-09-26T02:00:00Z');
      await insertSchedule(transferred, '2026-09-26T02:00:00Z');

      await expect(scheduleIds()).resolves.toEqual([kept]);
    });

    it('skips closed schedules and routine checkup appointments', async () => {
      const horse = await insertHorse('Winx');
      const kept = await insertSchedule(horse, '2026-09-26T02:00:00Z');
      await insertSchedule(horse, '2026-09-26T03:00:00Z', {
        status: CareScheduleStatus.COMPLETED,
      });
      await insertSchedule(horse, '2026-09-26T04:00:00Z', {
        status: CareScheduleStatus.CANCELLED,
      });
      await insertSchedule(horse, '2026-09-26T05:00:00Z', {
        type: CareScheduleType.ROUTINE_CHECKUP,
      });

      await expect(scheduleIds()).resolves.toEqual([kept]);
    });

    it('keeps only an assignee who is still valid', async () => {
      const horse = await insertHorse('Winx');
      const vet = await insertUser(UserRole.VETERINARIAN);
      const inactiveVet = await insertUser(
        UserRole.VETERINARIAN,
        UserStatus.INACTIVE,
      );
      const groom = await insertUser(UserRole.GROOM);
      const formerGroom = await insertUser(UserRole.GROOM);
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
        await insertSchedule(horse, `2026-09-26T0${hour}:00:00Z`, {
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
      const winx = await insertHorse('Winx');
      const other = await insertHorse('Other');
      const kept = await insertSchedule(winx, '2026-09-26T02:00:00Z');
      await insertSchedule(other, '2026-09-26T02:00:00Z');

      await expect(scheduleIds([winx])).resolves.toEqual([kept]);
    });
  });

  describe('herdCheckupAnchors', () => {
    it('lists active and retired horses, never deleted or transferred ones', async () => {
      await insertHorse('Active');
      await insertHorse('Retired', { lifecycle: HorseLifecycleStatus.RETIRED });
      await insertHorse('Deleted', { deleted: true });
      await insertHorse('Transferred', {
        lifecycle: HorseLifecycleStatus.TRANSFERRED,
      });

      const rows = await repository.herdCheckupAnchors();

      expect(rows.map((row) => row.horseName)).toEqual(['Active', 'Retired']);
    });

    it('takes the latest visit that was not voided, on the club calendar', async () => {
      const horse = await insertHorse('Winx');
      const vet = await insertUser(UserRole.VETERINARIAN);
      await insertVisit(horse, vet, '2026-09-10T02:00:00Z');
      await insertVisit(horse, vet, '2026-09-20T18:00:00Z');
      await insertVisit(horse, vet, '2026-09-25T02:00:00Z', true);

      const [row] = await repository.herdCheckupAnchors();

      expect(row).toMatchObject({
        lastVisitDate: '2026-09-21',
        createdDate: '2026-01-01',
      });
    });

    it('takes the latest reactivation, even when the horse retired again later', async () => {
      const horse = await insertHorse('Winx', {
        lifecycle: HorseLifecycleStatus.RETIRED,
      });
      await insertLifecycleAudit(
        horse,
        HorseLifecycleStatus.RETIRED,
        HorseLifecycleStatus.ACTIVE,
        '2026-05-01T02:00:00Z',
      );
      await insertLifecycleAudit(
        horse,
        HorseLifecycleStatus.RETIRED,
        HorseLifecycleStatus.ACTIVE,
        '2026-08-01T02:00:00Z',
      );
      await insertLifecycleAudit(
        horse,
        HorseLifecycleStatus.ACTIVE,
        HorseLifecycleStatus.RETIRED,
        '2026-09-01T02:00:00Z',
      );
      await insertLifecycleAudit(
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

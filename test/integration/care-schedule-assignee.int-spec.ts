import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { UserRole } from '../../src/common/enums/role.enum';
import type { Actor } from '../../src/common/types/actor';
import { AuditService } from '../../src/modules/audit/services/audit.service';
import { HorseAccessService } from '../../src/modules/horses/shared/horse-access.service';
import { CareSchedulesService } from '../../src/modules/medical/care-schedules/care-schedules.service';
import {
  CareAssigneeType,
  CareScheduleType,
} from '../../src/modules/medical/constants/care-schedule.enum';
import { CareScheduleEntity } from '../../src/modules/medical/entities/care-schedule.entity';
import { MedicalAccessService } from '../../src/modules/medical/shared/medical-access.service';
import { GroomTodayService } from '../../src/modules/stable/daily-checklists/groom-today.service';
import { CareScheduleAssigneeType1789827600000 } from '../../src/migrations/1789827600000-CareScheduleAssigneeType';
import { fixtures } from './fixtures';
import {
  startTestPostgres,
  stopTestPostgres,
  truncateAllTables,
  type TestPostgres,
} from './postgres';

describe('Care schedule assignee (Postgres)', () => {
  let db: TestPostgres;
  let dataSource: DataSource;
  let seed: ReturnType<typeof fixtures>;
  let schedules: CareSchedulesService;
  let today: GroomTodayService;
  let vet: Actor;
  let an: string;
  let binh: string;
  let horse: string;

  beforeAll(async () => {
    db = await startTestPostgres();
    dataSource = db.dataSource;
    seed = fixtures(dataSource);
    const access = new HorseAccessService(dataSource);
    schedules = new CareSchedulesService(
      dataSource,
      dataSource.getRepository(CareScheduleEntity),
      new MedicalAccessService(access, dataSource),
      access,
      new AuditService(),
    );
    today = new GroomTodayService(dataSource);
  });

  afterAll(() => stopTestPostgres(db));

  const actorOf = async (id: string, role: UserRole): Promise<Actor> => {
    const [row] = await dataSource.query<{ keycloak_id: string }[]>(
      'SELECT keycloak_id FROM users WHERE id = $1',
      [id],
    );
    return { sub: row.keycloak_id, roles: [role] };
  };

  const changeGroom = async (horseId: string, groomId: string) => {
    await dataSource.query(
      'UPDATE groom_assignments SET end_at = now() WHERE horse_id = $1 AND end_at IS NULL',
      [horseId],
    );
    await dataSource.query(
      `INSERT INTO groom_assignments (version, horse_id, groom_id, start_at)
       VALUES (1, $1, $2, now())`,
      [horseId, groomId],
    );
  };

  const todayIds = async (groomId: string) => {
    const result = await today.today(await actorOf(groomId, UserRole.GROOM));
    return {
      own: result.horses.flatMap((item) =>
        item.careSchedules.map((schedule) => schedule.id),
      ),
      other: result.otherCareSchedules.map((schedule) => schedule.id),
    };
  };

  const dueToday = () => new Date(Date.now() + 60_000).toISOString();

  beforeEach(async () => {
    await truncateAllTables(dataSource);
    vet = await actorOf(
      await seed.user(UserRole.VETERINARIAN),
      UserRole.VETERINARIAN,
    );
    an = await seed.user(UserRole.GROOM);
    binh = await seed.user(UserRole.GROOM);
    horse = await seed.horse('Winx');
    await changeGroom(horse, an);
  });

  it('follows the horse groom: the new groom sees and completes it after a groom change, the old one cannot', async () => {
    const created = await schedules.create(vet, horse, {
      type: CareScheduleType.FARRIER,
      dueAt: dueToday(),
      assigneeType: CareAssigneeType.GROOM,
    });
    expect(await todayIds(an)).toEqual({ own: [created.id], other: [] });

    await changeGroom(horse, binh);

    expect(await todayIds(an)).toEqual({ own: [], other: [] });
    expect(await todayIds(binh)).toEqual({ own: [created.id], other: [] });
    await expect(
      schedules.complete(await actorOf(an, UserRole.GROOM), created.id, {}),
    ).rejects.toThrow(ForbiddenException);
    await expect(
      schedules.complete(await actorOf(binh, UserRole.GROOM), created.id, {}),
    ).resolves.toMatchObject({ completed: { completedBy: binh } });
  });

  it('keeps a groom given by name, who sees it among other schedules and completes it without looking after the horse', async () => {
    const farrier = await seed.user(UserRole.GROOM);
    const created = await schedules.create(vet, horse, {
      type: CareScheduleType.FARRIER,
      dueAt: dueToday(),
      assigneeType: CareAssigneeType.GROOM,
      assignedTo: farrier,
    });

    await changeGroom(horse, binh);

    expect(await todayIds(binh)).toEqual({ own: [], other: [] });
    expect(await todayIds(farrier)).toEqual({ own: [], other: [created.id] });
    await expect(
      schedules.complete(
        await actorOf(farrier, UserRole.GROOM),
        created.id,
        {},
      ),
    ).resolves.toMatchObject({ completed: { completedBy: farrier } });
  });

  it('refuses a vet kind without a vet, and a person who is not a vet', async () => {
    await expect(
      schedules.create(vet, horse, {
        type: CareScheduleType.VACCINATION,
        dueAt: dueToday(),
        assigneeType: CareAssigneeType.VET,
      }),
    ).rejects.toThrow(BadRequestException);
    await expect(
      schedules.create(vet, horse, {
        type: CareScheduleType.VACCINATION,
        dueAt: dueToday(),
        assigneeType: CareAssigneeType.VET,
        assignedTo: an,
      }),
    ).rejects.toThrow('Người được giao phải là Bác sĩ thú y đang hoạt động');
  });

  it('refuses vaccination and deworming for a groom on create and on reassign, keeps an old groom one editable', async () => {
    const groomOnly = 'Tiêm phòng, tẩy giun chỉ giao được cho bác sĩ';
    for (const type of [
      CareScheduleType.VACCINATION,
      CareScheduleType.DEWORMING,
    ]) {
      await expect(
        schedules.create(vet, horse, {
          type,
          dueAt: dueToday(),
          assigneeType: CareAssigneeType.GROOM,
          assignedTo: an,
        }),
      ).rejects.toThrow(groomOnly);
    }
    const doctor = await seed.user(UserRole.VETERINARIAN);
    const vaccination = await schedules.create(vet, horse, {
      type: CareScheduleType.VACCINATION,
      dueAt: dueToday(),
      assigneeType: CareAssigneeType.VET,
      assignedTo: doctor,
    });
    await expect(
      schedules.update(vet, vaccination.id, {
        assigneeType: CareAssigneeType.GROOM,
      }),
    ).rejects.toThrow(groomOnly);
    await expect(
      schedules.update(vet, vaccination.id, { assigneeType: null }),
    ).resolves.toMatchObject({ assigneeType: null, assignedTo: null });

    await dataSource.query(
      `UPDATE care_schedules SET assignee_type = 'GROOM', assigned_to = NULL WHERE id = $1`,
      [vaccination.id],
    );
    await expect(
      schedules.update(vet, vaccination.id, { notes: 'Mang theo sổ tiêm' }),
    ).resolves.toMatchObject({
      assigneeType: CareAssigneeType.GROOM,
      notes: 'Mang theo sổ tiêm',
    });
  });

  describe('CareScheduleAssigneeType migration', () => {
    const migration = new CareScheduleAssigneeType1789827600000();

    it('turns open groom schedules into the horse groom, keeps vets and the history of done schedules', async () => {
      const vetId = await seed.user(UserRole.VETERINARIAN);
      const runner = dataSource.createQueryRunner();
      try {
        await migration.down(runner);
        const insert = async (assignedTo: string | null, status: string) => {
          const id = randomUUID();
          await runner.query(
            `INSERT INTO care_schedules (id, version, horse_id, type, due_at, status, assigned_to)
             VALUES ($1, 1, $2, 'FARRIER', now(), $3, $4)`,
            [id, horse, status, assignedTo],
          );
          return id;
        };
        const openGroom = await insert(an, 'SCHEDULED');
        const doneGroom = await insert(an, 'COMPLETED');
        const openVet = await insert(vetId, 'SCHEDULED');
        const nobody = await insert(null, 'SCHEDULED');

        await migration.up(runner);

        const rows = (await runner.query(
          'SELECT id, assignee_type, assigned_to FROM care_schedules',
        )) as Array<{
          id: string;
          assignee_type: string | null;
          assigned_to: string | null;
        }>;
        const byId = new Map(rows.map((row) => [row.id, row]));
        expect(byId.get(openGroom)).toMatchObject({
          assignee_type: 'GROOM',
          assigned_to: null,
        });
        expect(byId.get(doneGroom)).toMatchObject({
          assignee_type: 'GROOM',
          assigned_to: an,
        });
        expect(byId.get(openVet)).toMatchObject({
          assignee_type: 'VET',
          assigned_to: vetId,
        });
        expect(byId.get(nobody)).toMatchObject({
          assignee_type: null,
          assigned_to: null,
        });
        await expect(
          runner.query(
            `UPDATE care_schedules SET assigned_to = NULL WHERE id = $1`,
            [openVet],
          ),
        ).rejects.toThrow(/care_schedules_assignee_ck/);
      } finally {
        await runner.release();
      }
    });
  });
});

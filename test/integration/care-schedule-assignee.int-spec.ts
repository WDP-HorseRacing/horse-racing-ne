import { BadRequestException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { UserRole } from '../../src/common/enums/role.enum';
import type { Actor } from '../../src/common/types/actor';
import { AuditService } from '../../src/modules/audit/services/audit.service';
import { HorseAccessService } from '../../src/modules/horses/shared/horse-access.service';
import { CareSchedulesService } from '../../src/modules/medical/care-schedules/care-schedules.service';
import { CareScheduleType } from '../../src/modules/medical/constants/care-schedule.enum';
import { CareScheduleEntity } from '../../src/modules/medical/entities/care-schedule.entity';
import { MedicalAccessService } from '../../src/modules/medical/shared/medical-access.service';
import { GroomTodayService } from '../../src/modules/stable/daily-checklists/groom-today.service';
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
  let doctor: string;
  let groom: string;
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

  const dueToday = () => new Date(Date.now() + 60_000).toISOString();

  beforeEach(async () => {
    await truncateAllTables(dataSource);
    vet = await actorOf(
      await seed.user(UserRole.VETERINARIAN),
      UserRole.VETERINARIAN,
    );
    doctor = await seed.user(UserRole.VETERINARIAN);
    groom = await seed.user(UserRole.GROOM);
    horse = await seed.horse('Winx');
    await dataSource.query(
      `INSERT INTO groom_assignments (version, horse_id, groom_id, start_at)
       VALUES (1, $1, $2, now())`,
      [horse, groom],
    );
  });

  it('assigns a schedule to a vet by assignedTo alone, without an assignee kind in the response', async () => {
    const created = await schedules.create(vet, horse, {
      type: CareScheduleType.FARRIER,
      dueAt: dueToday(),
      assignedTo: doctor,
    });

    expect(created).toMatchObject({ assignedTo: doctor });
    expect(created).not.toHaveProperty('assigneeType');
  });

  it('refuses a person who is not an active vet on create and on reassign', async () => {
    const notVet = 'Người được giao phải là Bác sĩ thú y đang hoạt động';
    await expect(
      schedules.create(vet, horse, {
        type: CareScheduleType.FARRIER,
        dueAt: dueToday(),
        assignedTo: groom,
      }),
    ).rejects.toThrow(notVet);
    const created = await schedules.create(vet, horse, {
      type: CareScheduleType.FARRIER,
      dueAt: dueToday(),
    });
    await expect(
      schedules.update(vet, created.id, { assignedTo: groom }),
    ).rejects.toThrow(BadRequestException);
    await expect(
      schedules.update(vet, created.id, { assignedTo: doctor }),
    ).resolves.toMatchObject({ assignedTo: doctor });
    await expect(
      schedules.update(vet, created.id, { assignedTo: null }),
    ).resolves.toMatchObject({ assignedTo: null });
  });

  it('keeps the vet on the next schedule while active, otherwise leaves it unassigned', async () => {
    const first = await schedules.create(vet, horse, {
      type: CareScheduleType.FARRIER,
      dueAt: dueToday(),
      assignedTo: doctor,
    });
    const kept = await schedules.complete(vet, first.id, {
      nextDueAt: dueToday(),
    });
    expect(kept.next).toMatchObject({ assignedTo: doctor });

    await dataSource.query(
      `UPDATE users SET status = 'INACTIVE' WHERE id = $1`,
      [doctor],
    );
    const dropped = await schedules.complete(vet, kept.next!.id, {
      nextDueAt: dueToday(),
    });
    expect(dropped.next).toMatchObject({ assignedTo: null });
  });

  it('lets a groom read every schedule of the horse but shows none on the today screen', async () => {
    const created = await schedules.create(vet, horse, {
      type: CareScheduleType.FARRIER,
      dueAt: dueToday(),
      assignedTo: doctor,
    });
    const groomActor = await actorOf(groom, UserRole.GROOM);

    const listed = await schedules.list(groomActor, horse);
    expect(listed.map((item) => item.id)).toEqual([created.id]);

    const result = await today.today(groomActor);
    expect(result).not.toHaveProperty('otherCareSchedules');
    expect(result.horses[0]).not.toHaveProperty('careSchedules');
  });
});

import { ConflictException, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { UserRole } from '../../src/common/enums/role.enum';
import type { Actor } from '../../src/common/types/actor';
import { AuditService } from '../../src/modules/audit/services/audit.service';
import { HorseAccessService } from '../../src/modules/horses/shared/horse-access.service';
import { CareSchedulesService } from '../../src/modules/medical/care-schedules/care-schedules.service';
import {
  CareScheduleStatus,
  CareScheduleType,
} from '../../src/modules/medical/constants/care-schedule.enum';
import { CareScheduleEntity } from '../../src/modules/medical/entities/care-schedule.entity';
import { MedicalAccessService } from '../../src/modules/medical/shared/medical-access.service';
import { fixtures } from './fixtures';
import {
  startTestPostgres,
  stopTestPostgres,
  truncateAllTables,
  type TestPostgres,
} from './postgres';

const DAY_MS = 86_400_000;

describe('CareSchedulesService.reopen (Postgres)', () => {
  let db: TestPostgres;
  let dataSource: DataSource;
  let seed: ReturnType<typeof fixtures>;
  let schedules: CareSchedulesService;
  let vet: Actor;
  let vetId: string;
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
  });

  afterAll(() => stopTestPostgres(db));

  beforeEach(async () => {
    await truncateAllTables(dataSource);
    vetId = await seed.user(UserRole.VETERINARIAN);
    const [row] = await dataSource.query<{ keycloak_id: string }[]>(
      'SELECT keycloak_id FROM users WHERE id = $1',
      [vetId],
    );
    vet = { sub: row.keycloak_id, roles: [UserRole.VETERINARIAN] };
    horse = await seed.horse('Winx');
  });

  const dueAt = () => new Date(Date.now() + 2 * DAY_MS).toISOString();

  const created = () =>
    schedules.create(vet, horse, {
      type: CareScheduleType.VACCINATION,
      dueAt: dueAt(),
      assignedTo: vetId,
    });

  const row = (id: string) =>
    dataSource
      .query<
        {
          status: string;
          due_at: Date;
          completed_at: Date | null;
          completed_by: string | null;
        }[]
      >(
        'SELECT status, due_at, completed_at, completed_by FROM care_schedules WHERE id = $1',
        [id],
      )
      .then((rows) => rows[0]);

  it('puts a completed schedule back to scheduled with its due date, audits it with the reason, and lets it be completed again', async () => {
    const schedule = await created();
    await schedules.complete(vet, schedule.id, {});
    const due = (await row(schedule.id)).due_at;

    const reopened = await schedules.reopen(vet, schedule.id, {
      reason: 'Tick nhầm, chưa tiêm',
    });

    expect(reopened).toMatchObject({
      id: schedule.id,
      status: CareScheduleStatus.SCHEDULED,
      completedAt: null,
      completedBy: null,
    });
    expect(await row(schedule.id)).toEqual({
      status: CareScheduleStatus.SCHEDULED,
      due_at: due,
      completed_at: null,
      completed_by: null,
    });
    const audits = await dataSource.query<Record<string, unknown>[]>(
      `SELECT actor_id, before_data, after_data, reason, feature FROM audit_logs
        WHERE entity_type = 'CARE_SCHEDULE' AND entity_id = $1
          AND after_data->>'status' = 'SCHEDULED' AND before_data IS NOT NULL`,
      [schedule.id],
    );
    expect(audits).toEqual([
      {
        actor_id: vetId,
        before_data: {
          status: CareScheduleStatus.COMPLETED,
          completedAt: expect.any(String) as unknown,
          completedBy: vetId,
        },
        after_data: {
          status: CareScheduleStatus.SCHEDULED,
          completedAt: null,
          completedBy: null,
        },
        reason: 'Tick nhầm, chưa tiêm',
        feature: 'MED_CARE',
      },
    ]);

    await expect(
      schedules.complete(vet, schedule.id, {}),
    ).resolves.toMatchObject({
      completed: { status: CareScheduleStatus.COMPLETED, completedBy: vetId },
    });
  });

  it('keeps the next schedule created when it was completed', async () => {
    const schedule = await created();
    const { next } = await schedules.complete(vet, schedule.id, {
      nextDueAt: new Date(Date.now() + 30 * DAY_MS).toISOString(),
    });

    await schedules.reopen(vet, schedule.id, { reason: 'Tick nhầm' });

    expect((await row(next!.id)).status).toBe(CareScheduleStatus.SCHEDULED);
  });

  it('refuses a schedule that is not completed with 409', async () => {
    const open = await created();
    const cancelled = await created();
    await schedules.cancel(vet, cancelled.id, { reason: 'Không cần' });

    for (const id of [open.id, cancelled.id]) {
      await expect(
        schedules.reopen(vet, id, { reason: 'Tick nhầm' }),
      ).rejects.toThrow(
        new ConflictException('Chỉ mở lại được lịch chăm sóc đã hoàn tất'),
      );
    }
  });

  it('does not find vet appointments', async () => {
    const appointment = await seed.schedule(horse, dueAt(), {
      type: CareScheduleType.ROUTINE_CHECKUP,
      status: CareScheduleStatus.COMPLETED,
    });

    await expect(
      schedules.reopen(vet, appointment, { reason: 'Tick nhầm' }),
    ).rejects.toThrow(NotFoundException);
  });

  it('refuses a transferred horse like cancelling does', async () => {
    const schedule = await created();
    await schedules.complete(vet, schedule.id, {});
    await dataSource.query(
      `UPDATE horses SET lifecycle_status = 'TRANSFERRED' WHERE id = $1`,
      [horse],
    );

    await expect(
      schedules.reopen(vet, schedule.id, { reason: 'Tick nhầm' }),
    ).rejects.toThrow(ConflictException);
    expect((await row(schedule.id)).status).toBe(CareScheduleStatus.COMPLETED);
  });
});

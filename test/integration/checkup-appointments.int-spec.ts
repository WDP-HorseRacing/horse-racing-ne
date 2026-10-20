import { ConflictException, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { UserRole } from '../../src/common/enums/role.enum';
import { UserStatus } from '../../src/common/enums/user-status.enum';
import { DomainEventPublisher } from '../../src/common/infrastructure/events/domain-event.publisher';
import type { Actor } from '../../src/common/types/actor';
import {
  clubDateTimeToInstant,
  clubToday,
  shiftDays,
} from '../../src/common/utils/club-date';
import { CheckupAppointmentAssignee1789829100000 } from '../../src/migrations/1789829100000-CheckupAppointmentAssignee';
import { AuditService } from '../../src/modules/audit/services/audit.service';
import { HorseLifecycleStatus } from '../../src/modules/horses/enums/horse-status.enum';
import { HorseAccessService } from '../../src/modules/horses/shared/horse-access.service';
import { CareSchedulesService } from '../../src/modules/medical/care-schedules/care-schedules.service';
import { CheckupsService } from '../../src/modules/medical/care-schedules/checkups.service';
import {
  CareAssigneeType,
  CareScheduleStatus,
  CareScheduleType,
} from '../../src/modules/medical/constants/care-schedule.enum';
import {
  MEDICAL_CHECKUP_APPOINTMENT_CHANGED_EVENT,
  MEDICAL_CHECKUP_APPOINTMENT_DUE_EVENT,
  MEDICAL_CHECKUP_DUE_EVENT,
} from '../../src/modules/medical/constants/medical-events.constants';
import { CareScheduleEntity } from '../../src/modules/medical/entities/care-schedule.entity';
import { MedicalRemindersService } from '../../src/modules/medical/medical-reminders/medical-reminders.service';
import { MedicalAccessService } from '../../src/modules/medical/shared/medical-access.service';
import { MedicalCheckupsService } from '../../src/modules/medical/shared/medical-checkups.service';
import { fixtures } from './fixtures';
import {
  startTestPostgres,
  stopTestPostgres,
  truncateAllTables,
  type TestPostgres,
} from './postgres';

const DAY_MS = 24 * 60 * 60 * 1000;

describe('Routine checkup appointments (Postgres)', () => {
  let db: TestPostgres;
  let dataSource: DataSource;
  let seed: ReturnType<typeof fixtures>;
  let checkups: CheckupsService;
  let careSchedules: CareSchedulesService;
  let reminders: MedicalRemindersService;
  let vetA: string;
  let vetB: string;
  let actorA: Actor;
  let actorB: Actor;
  let horse: string;
  let today: string;

  const actorOf = async (id: string, role: UserRole): Promise<Actor> => {
    const [row] = await dataSource.query<{ keycloak_id: string }[]>(
      'SELECT keycloak_id FROM users WHERE id = $1',
      [id],
    );
    return { sub: row.keycloak_id, roles: [role] };
  };

  const at = (date: string, time = '09:00') =>
    clubDateTimeToInstant(date, time).toISOString();

  const appointmentRow = async (horseId: string) => {
    const [row] = await dataSource.query<
      {
        id: string;
        status: string;
        assignee_type: string | null;
        assigned_to: string | null;
        cancel_reason: string | null;
      }[]
    >(
      `SELECT id, status, assignee_type, assigned_to, cancel_reason
         FROM care_schedules
        WHERE horse_id = $1 AND type = $2
        ORDER BY created_at DESC LIMIT 1`,
      [horseId, CareScheduleType.ROUTINE_CHECKUP],
    );
    return row;
  };

  const outbox = <T>(eventName: string) =>
    dataSource
      .query<{ payload: T }[]>(
        'SELECT payload FROM outbox_events WHERE event_name = $1 ORDER BY created_at',
        [eventName],
      )
      .then((rows) => rows.map((row) => row.payload));

  beforeAll(async () => {
    db = await startTestPostgres();
    dataSource = db.dataSource;
    seed = fixtures(dataSource);
    const access = new HorseAccessService(dataSource);
    const medicalAccess = new MedicalAccessService(access, dataSource);
    const herdCheckups = new MedicalCheckupsService(dataSource);
    const events = new DomainEventPublisher();
    checkups = new CheckupsService(
      dataSource,
      medicalAccess,
      access,
      herdCheckups,
      new AuditService(),
      events,
    );
    careSchedules = new CareSchedulesService(
      dataSource,
      dataSource.getRepository(CareScheduleEntity),
      medicalAccess,
      access,
      new AuditService(),
    );
    reminders = new MedicalRemindersService(dataSource, herdCheckups, events);
  });

  afterAll(() => stopTestPostgres(db));

  beforeEach(async () => {
    await truncateAllTables(dataSource);
    today = clubToday();
    vetA = await seed.user(UserRole.VETERINARIAN);
    vetB = await seed.user(UserRole.VETERINARIAN);
    actorA = await actorOf(vetA, UserRole.VETERINARIAN);
    actorB = await actorOf(vetB, UserRole.VETERINARIAN);
    horse = await seed.horse('Gió', {
      createdAt: new Date(Date.now() - 28 * DAY_MS).toISOString(),
    });
  });

  describe('assignee', () => {
    it('assigns a new appointment to the vet who set it', async () => {
      const result = await checkups.setAppointment(actorA, horse, {
        scheduledAt: at(shiftDays(today, 1)),
      });

      expect(result).toMatchObject({ assignedTo: vetA });
      expect(result.assignedToName).toEqual(expect.any(String));
      await expect(appointmentRow(horse)).resolves.toMatchObject({
        assignee_type: CareAssigneeType.VET,
        assigned_to: vetA,
      });
    });

    it('hands a rescheduled appointment to the rescheduling vet and notifies the previous one once', async () => {
      await checkups.setAppointment(actorA, horse, {
        scheduledAt: at(shiftDays(today, 1)),
      });
      await checkups.setAppointment(actorB, horse, {
        scheduledAt: at(shiftDays(today, 2)),
        reason: 'BS A nghỉ ốm',
      });
      await checkups.setAppointment(actorB, horse, {
        scheduledAt: at(shiftDays(today, 2), '10:00'),
        reason: 'Đổi giờ',
      });

      await expect(appointmentRow(horse)).resolves.toMatchObject({
        assigned_to: vetB,
      });
      await expect(
        outbox(MEDICAL_CHECKUP_APPOINTMENT_CHANGED_EVENT),
      ).resolves.toEqual([
        expect.objectContaining({
          horseId: horse,
          change: 'RESCHEDULED',
          previousAssigneeId: vetA,
          reason: 'BS A nghỉ ốm',
        }),
      ]);
    });
  });

  describe('cancelAppointment', () => {
    it('cancels with the reason, audits it, notifies the assigned vet and lets the due reminder fire again', async () => {
      await checkups.setAppointment(actorA, horse, {
        scheduledAt: at(shiftDays(today, 1)),
      });
      await expect(reminders.notifyDueCheckups(today)).resolves.toBe(0);

      await checkups.cancelAppointment(actorB, horse, { reason: 'Đặt nhầm' });

      const row = await appointmentRow(horse);
      expect(row).toMatchObject({
        status: CareScheduleStatus.CANCELLED,
        cancel_reason: 'Đặt nhầm',
      });
      const audits = await dataSource.query<{ reason: string | null }[]>(
        `SELECT reason FROM audit_logs WHERE entity_id = $1 AND feature = 'MED_CHECKUP' ORDER BY created_at`,
        [row.id],
      );
      expect(audits.map((audit) => audit.reason)).toEqual([null, 'Đặt nhầm']);
      await expect(
        outbox(MEDICAL_CHECKUP_APPOINTMENT_CHANGED_EVENT),
      ).resolves.toEqual([
        expect.objectContaining({
          change: 'CANCELLED',
          previousAssigneeId: vetA,
        }),
      ]);
      await expect(reminders.notifyDueCheckups(today)).resolves.toBe(1);
      await expect(outbox(MEDICAL_CHECKUP_DUE_EVENT)).resolves.toEqual([
        expect.objectContaining({ horseId: horse }),
      ]);
    });

    it('returns 404 when there is no active appointment', async () => {
      await expect(
        checkups.cancelAppointment(actorA, horse, { reason: 'Đặt nhầm' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('returns 409 for a transferred horse', async () => {
      await checkups.setAppointment(actorA, horse, {
        scheduledAt: at(shiftDays(today, 1)),
      });
      await dataSource.query(
        'UPDATE horses SET lifecycle_status = $2 WHERE id = $1',
        [horse, HorseLifecycleStatus.TRANSFERRED],
      );
      await expect(
        checkups.cancelAppointment(actorA, horse, { reason: 'Đặt nhầm' }),
      ).rejects.toThrow(ConflictException);
    });

    it('keeps appointments out of the care schedule routes, so a groom cannot complete one', async () => {
      const groom = await seed.user(UserRole.GROOM);
      const appointment = await seed.schedule(horse, at(today), {
        type: CareScheduleType.ROUTINE_CHECKUP,
        assignedTo: vetA,
      });
      await expect(
        careSchedules.complete(
          await actorOf(groom, UserRole.GROOM),
          appointment,
          {},
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('appointment-day reminder', () => {
    type DueEvent = {
      eventId: string;
      horseId: string;
      assigneeId: string | null;
    };

    it('reminds the active assigned vet, falls back to every vet, and skips future, closed and gone horses', async () => {
      const lockedVet = await seed.user(
        UserRole.VETERINARIAN,
        UserStatus.LOCKED,
      );
      const past = await seed.horse('Mây');
      const locked = await seed.horse('Lửa');
      const future = await seed.horse('Sấm');
      const transferred = await seed.horse('Đi', {
        lifecycle: HorseLifecycleStatus.TRANSFERRED,
      });
      const deleted = await seed.horse('Xóa', { deleted: true });
      await seed.schedule(horse, at(today), {
        type: CareScheduleType.ROUTINE_CHECKUP,
        assignedTo: vetA,
      });
      await seed.schedule(past, at(shiftDays(today, -2)), {
        type: CareScheduleType.ROUTINE_CHECKUP,
      });
      await seed.schedule(locked, at(today), {
        type: CareScheduleType.ROUTINE_CHECKUP,
        assignedTo: lockedVet,
      });
      await seed.schedule(future, at(shiftDays(today, 1)), {
        type: CareScheduleType.ROUTINE_CHECKUP,
        assignedTo: vetA,
      });
      await seed.schedule(horse, at(today, '07:00'), {
        type: CareScheduleType.ROUTINE_CHECKUP,
        status: CareScheduleStatus.CANCELLED,
        assignedTo: vetA,
      });
      for (const gone of [transferred, deleted]) {
        await seed.schedule(gone, at(today), {
          type: CareScheduleType.ROUTINE_CHECKUP,
          assignedTo: vetA,
        });
      }

      await expect(reminders.notifyDueAppointments(today)).resolves.toBe(3);

      const events = await outbox<DueEvent>(
        MEDICAL_CHECKUP_APPOINTMENT_DUE_EVENT,
      );
      expect(
        Object.fromEntries(events.map((e) => [e.horseId, e.assigneeId])),
      ).toEqual({ [horse]: vetA, [past]: null, [locked]: null });
    });

    it('keeps one event id per appointment and date across runs, and a new one after rescheduling', async () => {
      const id = await seed.schedule(horse, at(today), {
        type: CareScheduleType.ROUTINE_CHECKUP,
        assignedTo: vetA,
      });

      await reminders.notifyDueAppointments(today);
      await reminders.notifyDueAppointments(shiftDays(today, 1));
      await dataSource.query(
        'UPDATE care_schedules SET due_at = $2 WHERE id = $1',
        [id, at(shiftDays(today, 1))],
      );
      await reminders.notifyDueAppointments(shiftDays(today, 1));

      const ids = (
        await outbox<DueEvent>(MEDICAL_CHECKUP_APPOINTMENT_DUE_EVENT)
      ).map((event) => event.eventId);
      expect(ids).toHaveLength(3);
      expect(ids[0]).toBe(ids[1]);
      expect(ids[2]).not.toBe(ids[0]);
    });
  });

  describe('migration CheckupAppointmentAssignee', () => {
    const migration = new CheckupAppointmentAssignee1789829100000();

    const audit = (entityId: string, actorId: string, createdAt: string) =>
      dataSource.query(
        `INSERT INTO audit_logs (action, entity_type, entity_id, actor_id, created_at)
         VALUES ('UPDATE', 'CARE_SCHEDULE', $1, $2, $3)`,
        [entityId, actorId, createdAt],
      );

    const insert = async (status = CareScheduleStatus.SCHEDULED) => {
      const id = randomUUID();
      await dataSource.query(
        `INSERT INTO care_schedules (id, version, horse_id, type, due_at, status)
         VALUES ($1, 1, $2, 'ROUTINE_CHECKUP', now(), $3)`,
        [id, await seed.horse(id), status],
      );
      return id;
    };

    const assignees = (ids: string[]) =>
      dataSource
        .query<
          {
            id: string;
            assignee_type: string | null;
            assigned_to: string | null;
          }[]
        >(
          'SELECT id, assignee_type, assigned_to FROM care_schedules WHERE id = ANY($1::uuid[])',
          [ids],
        )
        .then((rows) =>
          Object.fromEntries(
            rows.map((row) => [row.id, [row.assignee_type, row.assigned_to]]),
          ),
        );

    it('fills old appointments with the vet of the latest audit row and clears them on down', async () => {
      const manager = await seed.user(UserRole.CLUB_MANAGER);
      const rescheduled = await insert();
      await audit(rescheduled, vetA, '2026-10-01T01:00:00Z');
      await audit(rescheduled, vetB, '2026-10-02T01:00:00Z');
      const cancelledByTransfer = await insert(CareScheduleStatus.CANCELLED);
      await audit(cancelledByTransfer, vetA, '2026-10-01T01:00:00Z');
      await audit(cancelledByTransfer, manager, '2026-10-03T01:00:00Z');
      const noAudit = await insert();
      const ids = [rescheduled, cancelledByTransfer, noAudit];
      const runner = dataSource.createQueryRunner();
      try {
        await migration.up(runner);
        await expect(assignees(ids)).resolves.toEqual({
          [rescheduled]: [CareAssigneeType.VET, vetB],
          [cancelledByTransfer]: [CareAssigneeType.VET, vetA],
          [noAudit]: [null, null],
        });

        await migration.down(runner);
        await expect(assignees(ids)).resolves.toEqual({
          [rescheduled]: [null, null],
          [cancelledByTransfer]: [null, null],
          [noAudit]: [null, null],
        });
      } finally {
        await runner.release();
      }
    });
  });
});

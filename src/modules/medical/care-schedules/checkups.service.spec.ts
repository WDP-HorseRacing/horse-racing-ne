import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { UserRole } from '../../../common/enums/role.enum';
import type { Actor } from '../../../common/types/actor';
import { AuditAction } from '../../audit/constants/audit-action.enum';
import { HorseHealthStatus } from '../../horses/enums/horse-status.enum';
import { HorseAccessService } from '../../horses/shared/horse-access.service';
import {
  CareAssigneeType,
  CareScheduleStatus,
  CareScheduleType,
} from '../constants/care-schedule.enum';
import { MEDICAL_CHECKUP_APPOINTMENT_CHANGED_EVENT } from '../constants/medical-events.constants';
import { CheckupDueStatus } from '../constants/checkup.enum';
import { CareScheduleEntity } from '../entities/care-schedule.entity';
import { addDays } from '../policies/medical.policy';
import { toClubDate } from '../../../common/utils/club-date';
import { MedicalAccessService } from '../shared/medical-access.service';
import { MedicalCheckupsService } from '../shared/medical-checkups.service';
import { CheckupsService } from './checkups.service';

type Row = Record<string, unknown>;

const vet: Actor = { sub: 'kc-vet', roles: [UserRole.VETERINARIAN] };
const today = toClubDate(new Date());

describe('CheckupsService', () => {
  let anchors: Row[];
  let appointments: Map<string, Row>;
  let manager: {
    create: jest.Mock;
    save: jest.Mock;
    update: jest.Mock;
    exists: jest.Mock;
  };
  let shared: {
    herdCheckupAnchors: jest.Mock;
    activeAppointments: jest.Mock;
  };
  let access: { lockHorseForWrite: jest.Mock };
  let audit: { record: jest.Mock };
  let events: { publish: jest.Mock };
  let service: CheckupsService;

  const anchor = (horseId: string, lastVisitDaysAgo: number): Row => ({
    horseId,
    horseName: horseId,
    barnId: 'b1',
    healthStatus: HorseHealthStatus.ELIGIBLE,
    lastVisitDate: addDays(today, -lastVisitDaysAgo),
    createdDate: '2020-01-01',
    reactivatedDate: null,
  });

  beforeEach(() => {
    anchors = [anchor('ok', 5), anchor('overdue', 40), anchor('soon', 28)];
    appointments = new Map();
    manager = {
      create: jest.fn((_entity: unknown, row: Row) => ({ ...row })),
      save: jest.fn((row: Row) => Promise.resolve({ id: 'appt-1', ...row })),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
      exists: jest.fn().mockResolvedValue(true),
    };
    shared = {
      herdCheckupAnchors: jest.fn((filter: { horseIds?: string[] }) =>
        Promise.resolve(
          filter.horseIds
            ? anchors.filter((row) =>
                filter.horseIds?.includes(row.horseId as string),
              )
            : anchors,
        ),
      ),
      activeAppointments: jest.fn(() => Promise.resolve(appointments)),
    };
    access = {
      lockHorseForWrite: jest.fn().mockResolvedValue({
        caller: { id: 'vet-1', fullName: 'BS Một' },
        horse: { id: 'ok' },
      }),
    };
    audit = { record: jest.fn().mockResolvedValue(undefined) };
    events = { publish: jest.fn().mockResolvedValue(undefined) };
    const herdCheckups = Object.assign(
      new MedicalCheckupsService({} as DataSource),
      shared,
    );
    service = new CheckupsService(
      {
        transaction: jest.fn((work: (m: typeof manager) => unknown) =>
          work(manager),
        ),
      } as unknown as DataSource,
      access as unknown as MedicalAccessService,
      {
        currentUser: jest.fn().mockResolvedValue({ id: 'vet-1' }),
      } as unknown as HorseAccessService,
      herdCheckups,
      audit,
      events,
    );
  });

  describe('list', () => {
    it('puts overdue horses first, then due soon, then the rest', async () => {
      const items = await service.list(vet, {});
      expect(items.map((item) => [item.horseId, item.dueStatus])).toEqual([
        ['overdue', CheckupDueStatus.OVERDUE],
        ['soon', CheckupDueStatus.DUE_SOON],
        ['ok', CheckupDueStatus.OK],
      ]);
      expect(items[0].daysLeft).toBe(-10);
    });

    it('filters by due status', async () => {
      const items = await service.list(vet, {
        status: CheckupDueStatus.DUE_SOON,
      });
      expect(items.map((item) => item.horseId)).toEqual(['soon']);
    });
  });

  describe('setAppointment', () => {
    const inDays = (days: number) =>
      new Date(Date.now() + days * 86400000).toISOString();

    it('creates the first appointment before the due date', async () => {
      const result = await service.setAppointment(vet, 'ok', {
        scheduledAt: inDays(10),
      });
      expect(manager.create).toHaveBeenCalledWith(
        CareScheduleEntity,
        expect.objectContaining({
          horseId: 'ok',
          type: CareScheduleType.ROUTINE_CHECKUP,
          assigneeType: CareAssigneeType.VET,
          assignedTo: 'vet-1',
        }),
      );
      expect(audit.record).toHaveBeenCalledWith(
        manager,
        expect.objectContaining({
          action: AuditAction.CREATE,
          feature: 'MED_CHECKUP',
        }),
      );
      expect(result.id).toBe('appt-1');
    });

    it('rejects an appointment after the due date while the horse is not overdue', async () => {
      await expect(
        service.setAppointment(vet, 'ok', { scheduledAt: inDays(40) }),
      ).rejects.toThrow(BadRequestException);
      expect(manager.save).not.toHaveBeenCalled();
    });

    it('rejects an appointment in the past', async () => {
      await expect(
        service.setAppointment(vet, 'ok', { scheduledAt: inDays(-2) }),
      ).rejects.toThrow(BadRequestException);
    });

    it('lets an overdue horse be booked any day from today', async () => {
      access.lockHorseForWrite.mockResolvedValue({
        caller: { id: 'vet-1' },
        horse: { id: 'overdue' },
      });
      await expect(
        service.setAppointment(vet, 'overdue', { scheduledAt: inDays(20) }),
      ).resolves.toMatchObject({ horseId: 'overdue' });
    });

    it('requires a reason to reschedule and audits it', async () => {
      appointments.set('ok', {
        id: 'appt-0',
        horseId: 'ok',
        dueAt: new Date(inDays(3)),
      });
      await expect(
        service.setAppointment(vet, 'ok', { scheduledAt: inDays(5) }),
      ).rejects.toThrow(BadRequestException);
      await service.setAppointment(vet, 'ok', {
        scheduledAt: inDays(5),
        reason: 'Bác sĩ bận',
      });
      expect(manager.update).toHaveBeenCalledWith(
        CareScheduleEntity,
        { id: 'appt-0' },
        {
          dueAt: expect.any(Date) as unknown,
          assigneeType: CareAssigneeType.VET,
          assignedTo: 'vet-1',
        },
      );
      expect(audit.record).toHaveBeenCalledWith(
        manager,
        expect.objectContaining({
          action: AuditAction.UPDATE,
          reason: 'Bác sĩ bận',
        }),
      );
      expect(manager.save).not.toHaveBeenCalled();
    });

    it('hands a rescheduled appointment to the caller and notifies the previous vet', async () => {
      appointments.set('ok', {
        id: 'appt-0',
        horseId: 'ok',
        dueAt: new Date(inDays(3)),
        assignedTo: 'vet-2',
      });
      const result = await service.setAppointment(vet, 'ok', {
        scheduledAt: inDays(5),
        reason: 'BS Hai nghỉ ốm',
      });
      expect(result).toMatchObject({
        assignedTo: 'vet-1',
        assignedToName: 'BS Một',
      });
      expect(events.publish).toHaveBeenCalledWith(
        manager,
        MEDICAL_CHECKUP_APPOINTMENT_CHANGED_EVENT,
        expect.objectContaining({
          appointmentId: 'appt-0',
          change: 'RESCHEDULED',
          previousAssigneeId: 'vet-2',
          changedByName: 'BS Một',
          reason: 'BS Hai nghỉ ốm',
        }),
      );
    });

    it('does not notify when the vet reschedules their own appointment', async () => {
      appointments.set('ok', {
        id: 'appt-0',
        horseId: 'ok',
        dueAt: new Date(inDays(3)),
        assignedTo: 'vet-1',
      });
      await service.setAppointment(vet, 'ok', {
        scheduledAt: inDays(5),
        reason: 'Đổi giờ',
      });
      expect(events.publish).not.toHaveBeenCalled();
    });

    it('does not notify a previous vet who is no longer an active vet', async () => {
      appointments.set('ok', {
        id: 'appt-0',
        horseId: 'ok',
        dueAt: new Date(inDays(3)),
        assignedTo: 'vet-2',
      });
      manager.exists.mockResolvedValue(false);
      await service.setAppointment(vet, 'ok', {
        scheduledAt: inDays(5),
        reason: 'Đổi giờ',
      });
      expect(events.publish).not.toHaveBeenCalled();
    });

    it('propagates conflict for a transferred horse', async () => {
      access.lockHorseForWrite.mockRejectedValue(new ConflictException());
      await expect(
        service.setAppointment(vet, 'ok', { scheduledAt: inDays(3) }),
      ).rejects.toThrow(ConflictException);
    });

    it('propagates not found for a horse outside the caller scope', async () => {
      access.lockHorseForWrite.mockRejectedValue(new NotFoundException());
      await expect(
        service.setAppointment(vet, 'h9', { scheduledAt: inDays(3) }),
      ).rejects.toThrow(NotFoundException);
      expect(audit.record).not.toHaveBeenCalled();
    });
  });

  describe('cancelAppointment', () => {
    it('returns 404 when the horse has no active appointment', async () => {
      await expect(
        service.cancelAppointment(vet, 'ok', { reason: 'Đặt nhầm' }),
      ).rejects.toThrow(NotFoundException);
      expect(manager.update).not.toHaveBeenCalled();
    });

    it('propagates conflict for a transferred or deceased horse', async () => {
      access.lockHorseForWrite.mockRejectedValue(new ConflictException());
      await expect(
        service.cancelAppointment(vet, 'ok', { reason: 'Đặt nhầm' }),
      ).rejects.toThrow(ConflictException);
      expect(manager.update).not.toHaveBeenCalled();
    });

    it('cancels with the reason, audits it and notifies the assigned vet', async () => {
      const dueAt = new Date(Date.now() + 86400000);
      appointments.set('ok', {
        id: 'appt-0',
        horseId: 'ok',
        dueAt,
        status: CareScheduleStatus.SCHEDULED,
        assignedTo: 'vet-2',
      });
      await service.cancelAppointment(vet, 'ok', { reason: 'Đặt nhầm' });
      expect(manager.update).toHaveBeenCalledWith(
        CareScheduleEntity,
        { id: 'appt-0' },
        { status: CareScheduleStatus.CANCELLED, cancelReason: 'Đặt nhầm' },
      );
      expect(audit.record).toHaveBeenCalledWith(
        manager,
        expect.objectContaining({
          action: AuditAction.UPDATE,
          entityId: 'appt-0',
          reason: 'Đặt nhầm',
          feature: 'MED_CHECKUP',
        }),
      );
      expect(events.publish).toHaveBeenCalledWith(
        manager,
        MEDICAL_CHECKUP_APPOINTMENT_CHANGED_EVENT,
        expect.objectContaining({
          change: 'CANCELLED',
          scheduledAt: dueAt.toISOString(),
          previousAssigneeId: 'vet-2',
        }),
      );
    });

    it('does not notify when the appointment had no assigned vet', async () => {
      appointments.set('ok', {
        id: 'appt-0',
        horseId: 'ok',
        dueAt: new Date(),
        status: CareScheduleStatus.SCHEDULED,
        assignedTo: null,
      });
      await service.cancelAppointment(vet, 'ok', { reason: 'Đặt nhầm' });
      expect(events.publish).not.toHaveBeenCalled();
    });
  });
});

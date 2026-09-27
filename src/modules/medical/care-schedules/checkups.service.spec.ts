import { BadRequestException, ConflictException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { UserRole } from '../../../common/enums/role.enum';
import type { Actor } from '../../../common/types/actor';
import { AuditAction } from '../../audit/constants/audit-action.enum';
import { HorseHealthStatus } from '../../horses/enums/horse-status.enum';
import { HorseAccessService } from '../../horses/shared/horse-access.service';
import { CareScheduleType } from '../constants/care-schedule.enum';
import { CheckupDueStatus } from '../constants/checkup.enum';
import { CareScheduleEntity } from '../entities/care-schedule.entity';
import { addDays, toClubDate } from '../policies/medical.policy';
import { MedicalAccessService } from '../shared/medical-access.service';
import { MedicalCheckupsService } from '../shared/medical-checkups.service';
import { MedicalSharedRepository } from '../shared/medical-shared.repository';
import { CheckupsService } from './checkups.service';

type Row = Record<string, unknown>;

const vet: Actor = { sub: 'kc-vet', roles: [UserRole.VETERINARIAN] };
const today = toClubDate(new Date());

describe('CheckupsService', () => {
  let anchors: Row[];
  let appointments: Map<string, Row>;
  let manager: { create: jest.Mock; save: jest.Mock; update: jest.Mock };
  let shared: {
    herdCheckupAnchors: jest.Mock;
    activeAppointments: jest.Mock;
  };
  let access: { lockHorseForWrite: jest.Mock };
  let audit: { record: jest.Mock };
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
        caller: { id: 'vet-1' },
        horse: { id: 'ok' },
      }),
    };
    audit = { record: jest.fn().mockResolvedValue(undefined) };
    const typedShared = shared as unknown as MedicalSharedRepository;
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
      typedShared,
      new MedicalCheckupsService(typedShared),
      audit,
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
        }),
      );
      expect(audit.record).toHaveBeenCalledWith(
        manager,
        expect.objectContaining({
          action: AuditAction.CREATE,
          feature: 'F3.2',
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
        { dueAt: expect.any(Date) as unknown },
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

    it('propagates conflict for a transferred horse', async () => {
      access.lockHorseForWrite.mockRejectedValue(new ConflictException());
      await expect(
        service.setAppointment(vet, 'ok', { scheduledAt: inDays(3) }),
      ).rejects.toThrow(ConflictException);
    });
  });
});

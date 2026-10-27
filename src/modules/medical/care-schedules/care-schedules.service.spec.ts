import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { UserRole } from '../../../common/enums/role.enum';
import type { Actor } from '../../../common/types/actor';
import { HorseAccessService } from '../../horses/shared/horse-access.service';
import {
  CareScheduleStatus,
  CareScheduleType,
} from '../constants/care-schedule.enum';
import { CareScheduleEntity } from '../entities/care-schedule.entity';
import { MedicalAccessService } from '../shared/medical-access.service';
import { CareSchedulesService } from './care-schedules.service';

type Row = Record<string, unknown>;

const vet: Actor = { sub: 'kc-vet', roles: [UserRole.VETERINARIAN] };
const groom: Actor = { sub: 'kc-groom', roles: [UserRole.GROOM] };
const inDays = (days: number) =>
  new Date(Date.now() + days * 86400000).toISOString();

describe('CareSchedulesService', () => {
  let scheduleRow: Row | null;
  let assigneeValid: boolean;
  let callerId: string;
  let manager: {
    create: jest.Mock;
    save: jest.Mock;
    update: jest.Mock;
    findOne: jest.Mock;
    findOneOrFail: jest.Mock;
    exists: jest.Mock;
  };
  let schedules: { find: jest.Mock; findOne: jest.Mock };
  let lockHorseForWrite: jest.Mock;
  let findReadableHorseForActor: jest.Mock;
  let audit: { record: jest.Mock };
  let service: CareSchedulesService;

  beforeEach(() => {
    callerId = 'vet-1';
    assigneeValid = true;
    scheduleRow = {
      id: 's1',
      horseId: 'h1',
      type: CareScheduleType.FARRIER,
      dueAt: new Date(inDays(5)),
      assignedTo: null,
      status: CareScheduleStatus.SCHEDULED,
      notes: null,
    };
    manager = {
      create: jest.fn((_entity: unknown, row: Row) => ({ ...row })),
      save: jest.fn((row: Row) => Promise.resolve({ id: 's-new', ...row })),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
      findOne: jest.fn((_entity: unknown, options: { where: Row }) =>
        Promise.resolve(assigneeValid ? { id: options.where.id } : null),
      ),
      findOneOrFail: jest.fn(() => Promise.resolve({ ...scheduleRow })),
      exists: jest.fn(() => Promise.resolve(assigneeValid)),
    };
    schedules = {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn(() => Promise.resolve(scheduleRow)),
    };
    audit = { record: jest.fn().mockResolvedValue(undefined) };
    lockHorseForWrite = jest.fn(() =>
      Promise.resolve({ caller: { id: callerId }, horse: { id: 'h1' } }),
    );
    findReadableHorseForActor = jest.fn().mockResolvedValue({ id: 'h1' });
    service = new CareSchedulesService(
      {
        transaction: jest.fn((work: (m: typeof manager) => unknown) =>
          work(manager),
        ),
      } as unknown as DataSource,
      schedules as unknown as Repository<CareScheduleEntity>,
      { lockHorseForWrite } as unknown as MedicalAccessService,
      {
        findReadableHorseForActor,
        currentUser: jest.fn(() => Promise.resolve({ id: callerId })),
      } as unknown as HorseAccessService,
      audit,
    );
  });

  describe('create', () => {
    it.each([
      ['not found for a horse outside the caller scope', NotFoundException],
      ['conflict for a transferred horse', ConflictException],
    ])('propagates %s', async (_label, error) => {
      lockHorseForWrite.mockRejectedValue(new error());
      await expect(
        service.create(vet, 'h1', {
          type: CareScheduleType.FARRIER,
          dueAt: inDays(5),
        }),
      ).rejects.toThrow(error);
      expect(manager.save).not.toHaveBeenCalled();
      expect(audit.record).not.toHaveBeenCalled();
    });

    it('rejects a due date in the past', async () => {
      await expect(
        service.create(vet, 'h1', {
          type: CareScheduleType.VACCINATION,
          dueAt: inDays(-2),
        }),
      ).rejects.toThrow(BadRequestException);
      expect(manager.save).not.toHaveBeenCalled();
    });

    it('assigns an active vet', async () => {
      const result = await service.create(vet, 'h1', {
        type: CareScheduleType.FARRIER,
        dueAt: inDays(3),
        assignedTo: 'vet-2',
      });
      expect(result).toMatchObject({ assignedTo: 'vet-2' });
    });

    it('rejects a person who is not an active vet', async () => {
      assigneeValid = false;
      await expect(
        service.create(vet, 'h1', {
          type: CareScheduleType.FARRIER,
          dueAt: inDays(3),
          assignedTo: 'groom-1',
        }),
      ).rejects.toThrow(
        new BadRequestException(
          'Người được giao phải là Bác sĩ thú y đang hoạt động',
        ),
      );
      expect(manager.save).not.toHaveBeenCalled();
    });

    it('creates an unassigned scheduled task and audits it', async () => {
      const result = await service.create(vet, 'h1', {
        type: CareScheduleType.FARRIER,
        dueAt: inDays(3),
      });
      expect(result).toMatchObject({
        status: CareScheduleStatus.SCHEDULED,
        type: CareScheduleType.FARRIER,
        assignedTo: null,
      });
      expect(audit.record).toHaveBeenCalledWith(
        manager,
        expect.objectContaining({ feature: 'MED_CARE' }),
      );
    });
  });

  describe('update', () => {
    it('answers not found for a missing schedule', async () => {
      scheduleRow = null;
      await expect(service.update(vet, 's404', { notes: 'x' })).rejects.toThrow(
        NotFoundException,
      );
      expect(lockHorseForWrite).not.toHaveBeenCalled();
    });

    it('propagates conflict for a transferred horse', async () => {
      lockHorseForWrite.mockRejectedValue(new ConflictException());
      await expect(service.update(vet, 's1', { notes: 'x' })).rejects.toThrow(
        ConflictException,
      );
      expect(manager.update).not.toHaveBeenCalled();
    });

    it('rejects moving the due date into the past', async () => {
      await expect(
        service.update(vet, 's1', { dueAt: inDays(-2), reason: 'Dời lịch' }),
      ).rejects.toThrow(BadRequestException);
      expect(manager.update).not.toHaveBeenCalled();
    });

    it('rejects an assignee who is not an active vet', async () => {
      assigneeValid = false;
      await expect(
        service.update(vet, 's1', { assignedTo: 'user-x' }),
      ).rejects.toThrow(BadRequestException);
      expect(manager.update).not.toHaveBeenCalled();
    });

    it('requires a reason to move the due date', async () => {
      await expect(
        service.update(vet, 's1', { dueAt: inDays(8) }),
      ).rejects.toThrow(BadRequestException);
      expect(manager.update).not.toHaveBeenCalled();
    });

    it('answers conflict for a completed schedule', async () => {
      scheduleRow = { ...scheduleRow, status: CareScheduleStatus.COMPLETED };
      await expect(service.update(vet, 's1', { notes: 'x' })).rejects.toThrow(
        ConflictException,
      );
    });

    it('writes nothing and audits nothing when no field changes', async () => {
      await service.update(vet, 's1', { notes: null, assignedTo: null });
      expect(manager.update).not.toHaveBeenCalled();
      expect(audit.record).not.toHaveBeenCalled();
    });

    it('reschedules with a reason and audits it', async () => {
      await service.update(vet, 's1', {
        dueAt: inDays(8),
        reason: 'Thợ móng bận',
      });
      expect(audit.record).toHaveBeenCalledWith(
        manager,
        expect.objectContaining({ reason: 'Thợ móng bận' }),
      );
    });
  });

  describe('complete', () => {
    it('completes a task without a next one', async () => {
      const result = await service.complete(vet, 's1', {});
      expect(result.completed).toMatchObject({
        status: CareScheduleStatus.COMPLETED,
        completedBy: 'vet-1',
      });
      expect(result.next).toBeNull();
    });

    it('books the next due date and keeps the vet', async () => {
      scheduleRow = { ...scheduleRow, assignedTo: 'vet-9' };
      const result = await service.complete(vet, 's1', {
        nextDueAt: inDays(60),
      });
      expect(result.next).toMatchObject({
        type: CareScheduleType.FARRIER,
        status: CareScheduleStatus.SCHEDULED,
        assignedTo: 'vet-9',
      });
    });

    it('leaves the next schedule unassigned when the vet is no longer valid', async () => {
      scheduleRow = { ...scheduleRow, assignedTo: 'vet-9' };
      assigneeValid = false;
      const result = await service.complete(vet, 's1', {
        nextDueAt: inDays(60),
      });
      expect(result.next).toMatchObject({ assignedTo: null });
    });

    it('answers conflict for a cancelled schedule', async () => {
      scheduleRow = { ...scheduleRow, status: CareScheduleStatus.CANCELLED };
      await expect(service.complete(vet, 's1', {})).rejects.toThrow(
        ConflictException,
      );
    });

    it('answers not found for a missing schedule', async () => {
      scheduleRow = null;
      await expect(service.complete(vet, 's404', {})).rejects.toThrow(
        NotFoundException,
      );
    });

    it('rejects a next due date in the past', async () => {
      await expect(
        service.complete(vet, 's1', { nextDueAt: inDays(-2) }),
      ).rejects.toThrow(BadRequestException);
      expect(manager.update).not.toHaveBeenCalled();
    });

    it('propagates conflict for a transferred horse', async () => {
      lockHorseForWrite.mockRejectedValue(new ConflictException());
      await expect(service.complete(vet, 's1', {})).rejects.toThrow(
        ConflictException,
      );
      expect(manager.update).not.toHaveBeenCalled();
    });
  });

  describe('cancel', () => {
    it('answers not found for a missing schedule', async () => {
      scheduleRow = null;
      await expect(
        service.cancel(vet, 's404', { reason: 'x' }),
      ).rejects.toThrow(NotFoundException);
      expect(lockHorseForWrite).not.toHaveBeenCalled();
    });

    it('propagates conflict for a transferred horse', async () => {
      lockHorseForWrite.mockRejectedValue(new ConflictException());
      await expect(service.cancel(vet, 's1', { reason: 'x' })).rejects.toThrow(
        ConflictException,
      );
      expect(manager.update).not.toHaveBeenCalled();
    });

    it('answers conflict for a schedule already completed', async () => {
      scheduleRow = { ...scheduleRow, status: CareScheduleStatus.COMPLETED };
      await expect(service.cancel(vet, 's1', { reason: 'x' })).rejects.toThrow(
        ConflictException,
      );
      expect(manager.update).not.toHaveBeenCalled();
    });

    it('cancels with the reason', async () => {
      const result = await service.cancel(vet, 's1', {
        reason: 'Ngựa đã tiêm ở nơi khác',
      });
      expect(result).toMatchObject({
        status: CareScheduleStatus.CANCELLED,
        cancelReason: 'Ngựa đã tiêm ở nơi khác',
      });
    });
  });

  describe('list', () => {
    it('answers not found for a horse outside the caller scope', async () => {
      findReadableHorseForActor.mockRejectedValue(new NotFoundException());
      await expect(service.list(vet, 'h9')).rejects.toThrow(NotFoundException);
      expect(schedules.find).not.toHaveBeenCalled();
    });

    it('shows a groom every task of the horse', async () => {
      schedules.find.mockResolvedValue([
        { ...scheduleRow, id: 'vet', assignedTo: 'vet-1' },
        { ...scheduleRow, id: 'nobody' },
      ]);
      const result = await service.list(groom, 'h1');
      expect(result.map((item) => item.id)).toEqual(['vet', 'nobody']);
    });

    it('shows a vet every task of the horse', async () => {
      await service.list(vet, 'h1');
      const [[options]] = schedules.find.mock.calls as Array<[{ where: Row }]>;
      expect(options.where).not.toHaveProperty('assignedTo');
    });
  });
});

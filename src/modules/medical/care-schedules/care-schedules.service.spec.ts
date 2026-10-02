import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { UserRole } from '../../../common/enums/role.enum';
import type { Actor } from '../../../common/types/actor';
import { HorseAccessService } from '../../horses/shared/horse-access.service';
import { HorsesSharedRepository } from '../../horses/shared/horses-shared.repository';
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
  let assigneeRole: UserRole;
  let groomAssigned: boolean;
  let callerId: string;
  let manager: {
    create: jest.Mock;
    save: jest.Mock;
    update: jest.Mock;
    findOne: jest.Mock;
    findOneOrFail: jest.Mock;
  };
  let schedules: { find: jest.Mock; findOne: jest.Mock };
  let lockHorseForWrite: jest.Mock;
  let findReadableHorseForActor: jest.Mock;
  let audit: { record: jest.Mock };
  let service: CareSchedulesService;

  beforeEach(() => {
    callerId = 'vet-1';
    assigneeValid = true;
    assigneeRole = UserRole.GROOM;
    groomAssigned = true;
    scheduleRow = {
      id: 's1',
      horseId: 'h1',
      type: CareScheduleType.FARRIER,
      dueAt: new Date(inDays(5)),
      assignedTo: 'groom-1',
      status: CareScheduleStatus.SCHEDULED,
      notes: null,
    };
    manager = {
      create: jest.fn((_entity: unknown, row: Row) => ({ ...row })),
      save: jest.fn((row: Row) => Promise.resolve({ id: 's-new', ...row })),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
      findOne: jest.fn((_entity: unknown, options: { where: Row }) =>
        Promise.resolve(
          assigneeValid ? { id: options.where.id, role: assigneeRole } : null,
        ),
      ),
      findOneOrFail: jest.fn(() => Promise.resolve({ ...scheduleRow })),
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
      {
        isGroomAssigned: jest.fn(() => Promise.resolve(groomAssigned)),
      } as unknown as HorsesSharedRepository,
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

    it('rejects a groom who does not look after the horse as assignee', async () => {
      groomAssigned = false;
      await expect(
        service.create(vet, 'h1', {
          type: CareScheduleType.FARRIER,
          dueAt: inDays(3),
          assignedTo: 'groom-2',
        }),
      ).rejects.toThrow(BadRequestException);
      expect(manager.save).not.toHaveBeenCalled();
    });

    it('rejects an assignee who is not an active vet or groom', async () => {
      assigneeValid = false;
      await expect(
        service.create(vet, 'h1', {
          type: CareScheduleType.FARRIER,
          dueAt: inDays(3),
          assignedTo: 'owner-1',
        }),
      ).rejects.toThrow(BadRequestException);
      expect(manager.save).not.toHaveBeenCalled();
    });

    it('creates a scheduled task and audits it', async () => {
      const result = await service.create(vet, 'h1', {
        type: CareScheduleType.DEWORMING,
        dueAt: inDays(3),
        assignedTo: 'groom-1',
      });
      expect(result).toMatchObject({
        status: CareScheduleStatus.SCHEDULED,
        type: CareScheduleType.DEWORMING,
        assignedTo: 'groom-1',
      });
      expect(audit.record).toHaveBeenCalledWith(
        manager,
        expect.objectContaining({ feature: 'F3.11' }),
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

    it('rejects an assignee who is not an active vet or groom', async () => {
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
      await service.update(vet, 's1', { notes: null, assignedTo: 'groom-1' });
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
    it('lets the assigned groom complete the task', async () => {
      callerId = 'groom-1';
      const result = await service.complete(groom, 's1', {});
      expect(result.completed).toMatchObject({
        status: CareScheduleStatus.COMPLETED,
        completedBy: 'groom-1',
      });
      expect(result.next).toBeNull();
    });

    it('rejects the assigned groom who no longer looks after the horse with 403', async () => {
      callerId = 'groom-1';
      groomAssigned = false;
      await expect(service.complete(groom, 's1', {})).rejects.toThrow(
        ForbiddenException,
      );
      expect(manager.update).not.toHaveBeenCalled();
    });

    it('lets a vet book the next due date and keeps a still valid assignee', async () => {
      const result = await service.complete(vet, 's1', {
        nextDueAt: inDays(60),
      });
      expect(result.next).toMatchObject({
        type: CareScheduleType.FARRIER,
        status: CareScheduleStatus.SCHEDULED,
        assignedTo: 'groom-1',
      });
    });

    it('drops an assignee who is no longer valid on the next schedule', async () => {
      groomAssigned = false;
      const result = await service.complete(vet, 's1', {
        nextDueAt: inDays(60),
      });
      expect(result.next?.assignedTo).toBeNull();
    });

    it('rejects a groom booking the next due date with 403', async () => {
      callerId = 'groom-1';
      await expect(
        service.complete(groom, 's1', { nextDueAt: inDays(60) }),
      ).rejects.toThrow(ForbiddenException);
      expect(manager.update).not.toHaveBeenCalled();
    });

    it('rejects a groom who is not the assignee with 403', async () => {
      callerId = 'groom-2';
      await expect(service.complete(groom, 's1', {})).rejects.toThrow(
        ForbiddenException,
      );
      expect(manager.update).not.toHaveBeenCalled();
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

    it('shows a groom only the tasks assigned to them', async () => {
      callerId = 'groom-1';
      await service.list(groom, 'h1');
      expect(schedules.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ assignedTo: 'groom-1' }) as unknown,
        }),
      );
    });

    it('shows nothing to a groom no longer assigned to the horse', async () => {
      callerId = 'groom-1';
      groomAssigned = false;
      await expect(service.list(groom, 'h1')).resolves.toEqual([]);
      expect(schedules.find).not.toHaveBeenCalled();
    });

    it('shows a vet every task of the horse', async () => {
      await service.list(vet, 'h1');
      const [[options]] = schedules.find.mock.calls as Array<[{ where: Row }]>;
      expect(options.where).not.toHaveProperty('assignedTo');
    });
  });
});

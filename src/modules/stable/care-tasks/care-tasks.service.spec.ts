import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { UserRole } from '../../../common/enums/role.enum';
import type { Actor } from '../../../common/types/actor';
import { AuditAction } from '../../audit/constants/audit-action.enum';
import { AuditEntityType } from '../../audit/constants/audit-entity-type.enum';
import { AuditFeature } from '../../audit/constants/audit-feature.enum';
import { DailyChecklistItemEntity } from '../entities/daily-checklist-item.entity';
import { CareTaskTypeEntity } from '../entities/care-task-type.entity';
import { HorseCareTaskEntity } from '../entities/horse-care-task.entity';
import { HorseCareTaskMode } from '../constants/horse-care-task-mode.enum';
import { CARE_TASK_CHANGED_EVENT } from '../constants/stable-events.constants';
import type { DailyChecklistsService } from '../shared/daily-checklists.service';
import type { StableAccessService } from '../shared/stable-access.service';
import type { AuditService } from '../../audit/services/audit.service';
import type { DomainEventPublisher } from '../../../common/infrastructure/events/domain-event.publisher';
import { CareTasksService } from './care-tasks.service';

jest.mock('../../users/utils/current-user', () => ({
  currentUserForActor: jest.fn().mockResolvedValue({
    id: 'user-1',
    fullName: 'Bác sĩ Một',
    role: UserRole.VETERINARIAN,
  }),
}));

describe('CareTasksService', () => {
  const today = '2026-11-09';
  const caller = { id: 'user-1', fullName: 'Bác sĩ Một' };
  const headTrainer: Actor = {
    sub: 'kc-trainer',
    roles: [UserRole.HEAD_TRAINER],
  };
  const veterinarian: Actor = {
    sub: 'kc-vet',
    roles: [UserRole.VETERINARIAN],
  };
  const horseId = 'horse-1';

  let manager: Record<string, jest.Mock>;
  let transaction: jest.Mock;
  let types: { find: jest.Mock };
  let tasks: { find: jest.Mock };
  let taskType: Record<string, any>;
  let task: Record<string, any>;
  let access: {
    findHorseForDailyCare: jest.Mock;
    lockCareTaskHorse: jest.Mock;
  };
  let checklists: {
    ensureChecklist: jest.Mock;
    addTaskToChecklist: jest.Mock;
    removeUntickedTaskFromChecklist: jest.Mock;
    removeUntickedTaskFromDay: jest.Mock;
  };
  let audit: { record: jest.Mock };
  let events: { publish: jest.Mock };
  let service: CareTasksService;

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-11-09T03:00:00.000Z'));

    taskType = {
      id: 'type-1',
      name: 'Kiểm tra móng',
      appliesToAll: false,
      active: true,
      createdAt: new Date('2026-11-01T00:00:00.000Z'),
    };
    task = {
      id: 'task-1',
      horseId,
      taskTypeId: taskType.id,
      taskType,
      mode: HorseCareTaskMode.EXTRA,
      fromDate: today,
      toDate: '2026-11-16',
      note: null,
      createdBy: caller.id,
      creator: caller,
      createdAt: new Date('2026-11-09T03:00:00.000Z'),
    };

    manager = {
      find: jest.fn().mockResolvedValue([taskType]),
      findOne: jest.fn((entity: unknown) =>
        Promise.resolve(entity === CareTaskTypeEntity ? taskType : task),
      ),
      findOneBy: jest.fn((entity: unknown) =>
        Promise.resolve(entity === CareTaskTypeEntity ? taskType : task),
      ),
      findOneByOrFail: jest.fn().mockResolvedValue(taskType),
      exists: jest.fn().mockResolvedValue(false),
      create: jest.fn((_entity: unknown, row: object) => row),
      save: jest.fn((row: Record<string, any>) => {
        if ('name' in row) {
          Object.assign(taskType, row, { id: row.id ?? 'type-created' });
          return Promise.resolve(taskType);
        }
        Object.assign(task, row, {
          id: row.id ?? 'task-created',
          taskType,
          creator: caller,
        });
        return Promise.resolve(task);
      }),
      delete: jest.fn().mockResolvedValue({ affected: 1 }),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    transaction = jest.fn(
      (work: (entityManager: EntityManager) => Promise<unknown>) =>
        work(manager as unknown as EntityManager),
    );
    types = { find: jest.fn().mockResolvedValue([taskType]) };
    tasks = { find: jest.fn().mockResolvedValue([task]) };
    access = {
      findHorseForDailyCare: jest.fn().mockResolvedValue({ id: horseId }),
      lockCareTaskHorse: jest.fn().mockResolvedValue({
        horse: { id: horseId, barnId: 'barn-1' },
        inTrainerBarn: true,
      }),
    };
    checklists = {
      ensureChecklist: jest.fn().mockResolvedValue('checklist-1'),
      addTaskToChecklist: jest.fn().mockResolvedValue(undefined),
      removeUntickedTaskFromChecklist: jest.fn().mockResolvedValue(undefined),
      removeUntickedTaskFromDay: jest.fn().mockResolvedValue(undefined),
    };
    audit = { record: jest.fn().mockResolvedValue(undefined) };
    events = { publish: jest.fn().mockResolvedValue(undefined) };
    const dataSource = { manager, transaction } as unknown as DataSource;
    service = new CareTasksService(
      types as unknown as Repository<CareTaskTypeEntity>,
      tasks as unknown as Repository<HorseCareTaskEntity>,
      access as unknown as StableAccessService,
      checklists as unknown as DailyChecklistsService,
      dataSource,
      audit as unknown as AuditService,
      events as unknown as DomainEventPublisher,
    );
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('listTypes', () => {
    it('loads task types in creation and name order', async () => {
      await expect(service.listTypes(headTrainer)).resolves.toMatchObject([
        { id: taskType.id, name: taskType.name, active: true },
      ]);
      expect(types.find).toHaveBeenCalledWith({
        order: { createdAt: 'ASC', name: 'ASC' },
      });
    });
  });

  describe('createType', () => {
    it('trims the name, enables the type and records its creation', async () => {
      const result = await service.createType(veterinarian, {
        name: '  Vệ sinh móng  ',
        appliesToAll: true,
      });

      expect(manager.create).toHaveBeenCalledWith(CareTaskTypeEntity, {
        name: 'Vệ sinh móng',
        appliesToAll: true,
        active: true,
      });
      expect(audit.record).toHaveBeenCalledWith(
        manager,
        expect.objectContaining({
          actorId: caller.id,
          action: AuditAction.CREATE,
          entityType: AuditEntityType.CARE_TASK_TYPE,
          feature: AuditFeature.CARE_TASK,
        }),
      );
      expect(result).toMatchObject({ name: 'Vệ sinh móng', active: true });
    });
  });

  describe('updateType', () => {
    it('deactivates the type, removes unticked tasks today and audits changed fields', async () => {
      await service.updateType(veterinarian, taskType.id, { active: false });

      expect(checklists.removeUntickedTaskFromDay).toHaveBeenCalledWith(
        manager,
        today,
        taskType.id,
      );
      expect(audit.record).toHaveBeenCalledWith(
        manager,
        expect.objectContaining({
          actorId: caller.id,
          action: AuditAction.UPDATE,
          entityType: AuditEntityType.CARE_TASK_TYPE,
          entityId: taskType.id,
          before: { active: true },
          after: { active: false },
          feature: AuditFeature.CARE_TASK,
        }),
      );
    });

    it('does not write an audit entry when the type is unchanged', async () => {
      await service.updateType(veterinarian, taskType.id, {});
      expect(audit.record).not.toHaveBeenCalled();
    });

    it('rejects a rename after the type was used in a checklist', async () => {
      manager.exists.mockImplementation((entity: unknown) =>
        Promise.resolve(entity === DailyChecklistItemEntity),
      );

      await expect(
        service.updateType(veterinarian, taskType.id, { name: 'Móng mới' }),
      ).rejects.toThrow(ConflictException);
      expect(manager.save).not.toHaveBeenCalled();
    });

    it('returns not found for an unknown type', async () => {
      manager.findOne.mockResolvedValue(null);

      await expect(
        service.updateType(veterinarian, 'missing', { active: false }),
      ).rejects.toThrow(new NotFoundException('Không tìm thấy loại việc'));
    });
  });

  describe('listForHorse', () => {
    it('checks horse read access and loads tasks newest first', async () => {
      await expect(
        service.listForHorse(headTrainer, horseId),
      ).resolves.toMatchObject([
        { id: task.id, horseId, taskType: { name: taskType.name } },
      ]);

      expect(access.findHorseForDailyCare).toHaveBeenCalledWith(
        manager,
        headTrainer,
        caller.id,
        horseId,
      );
      expect(tasks.find).toHaveBeenCalledWith({
        where: { horseId },
        relations: { taskType: true, creator: true },
        withDeleted: true,
        order: { fromDate: 'DESC', createdAt: 'DESC' },
      });
    });
  });

  describe('createForHorse', () => {
    const body = {
      taskTypeId: 'type-1',
      fromDate: today,
      toDate: '2026-11-16',
      note: '  Theo dõi sau tập  ',
    };

    it('adds an EXTRA task to today’s checklist and trims the note', async () => {
      await service.createForHorse(headTrainer, horseId, body);

      expect(access.lockCareTaskHorse).toHaveBeenCalledWith(
        manager,
        headTrainer,
        caller.id,
        horseId,
      );
      expect(manager.create).toHaveBeenCalledWith(HorseCareTaskEntity, {
        horseId,
        taskTypeId: taskType.id,
        mode: HorseCareTaskMode.EXTRA,
        fromDate: today,
        toDate: '2026-11-16',
        note: 'Theo dõi sau tập',
        createdBy: caller.id,
      });
      expect(checklists.ensureChecklist).toHaveBeenCalledWith(
        manager,
        horseId,
        today,
      );
      expect(checklists.addTaskToChecklist).toHaveBeenCalledWith(
        manager,
        horseId,
        today,
        taskType,
      );
      expect(audit.record).toHaveBeenCalledWith(
        manager,
        expect.objectContaining({
          action: AuditAction.CREATE,
          entityType: AuditEntityType.HORSE_CARE_TASK,
          feature: AuditFeature.CARE_TASK,
        }),
      );
    });

    it('publishes a change event when a Veterinarian adds a task', async () => {
      access.lockCareTaskHorse.mockResolvedValue({
        horse: { id: horseId, barnId: 'barn-1' },
        inTrainerBarn: false,
      });

      await service.createForHorse(veterinarian, horseId, body);

      expect(events.publish).toHaveBeenCalledWith(
        manager,
        CARE_TASK_CHANGED_EVENT,
        expect.objectContaining({
          horseId,
          action: 'ADDED',
          mode: HorseCareTaskMode.EXTRA,
          taskName: taskType.name,
          veterinarianId: caller.id,
          veterinarianName: caller.fullName,
        }),
      );
    });

    it('removes today’s shared checklist task when exempting it', async () => {
      taskType.appliesToAll = true;

      await service.createForHorse(headTrainer, horseId, {
        ...body,
        mode: HorseCareTaskMode.EXEMPT,
        note: 'Không phù hợp hôm nay',
      });

      expect(checklists.removeUntickedTaskFromChecklist).toHaveBeenCalledWith(
        manager,
        horseId,
        today,
        taskType.id,
      );
      expect(checklists.addTaskToChecklist).not.toHaveBeenCalled();
    });

    it('requires a reason when exempting a shared task', async () => {
      taskType.appliesToAll = true;

      await expect(
        service.createForHorse(headTrainer, horseId, {
          ...body,
          mode: HorseCareTaskMode.EXEMPT,
        }),
      ).rejects.toThrow(BadRequestException);
      expect(manager.save).not.toHaveBeenCalled();
    });

    it('rejects overlapping task dates before writing', async () => {
      manager.exists.mockResolvedValue(true);

      await expect(
        service.createForHorse(headTrainer, horseId, body),
      ).rejects.toThrow(ConflictException);
      expect(manager.save).not.toHaveBeenCalled();
    });
  });

  describe('removeForHorse', () => {
    it('deletes a task that starts today and removes it from today’s checklist', async () => {
      task.mode = HorseCareTaskMode.EXTRA;
      task.fromDate = today;
      task.toDate = '2026-11-16';

      await expect(
        service.removeForHorse(headTrainer, task.id),
      ).resolves.toBeUndefined();

      expect(manager.delete).toHaveBeenCalledWith(HorseCareTaskEntity, {
        id: task.id,
      });
      expect(checklists.removeUntickedTaskFromChecklist).toHaveBeenCalledWith(
        manager,
        horseId,
        today,
        task.taskTypeId,
      );
      expect(audit.record).toHaveBeenCalledWith(
        manager,
        expect.objectContaining({
          action: AuditAction.DELETE,
          entityId: task.id,
          after: null,
        }),
      );
    });

    it('ends an active EXTRA task today instead of deleting its history', async () => {
      task.mode = HorseCareTaskMode.EXTRA;
      task.fromDate = '2026-11-08';
      task.toDate = '2026-11-16';

      await service.removeForHorse(headTrainer, task.id);

      expect(manager.update).toHaveBeenCalledWith(
        HorseCareTaskEntity,
        { id: task.id },
        { toDate: today },
      );
      expect(manager.delete).not.toHaveBeenCalled();
    });

    it('ends an EXEMPT task yesterday and restores the shared task today', async () => {
      task.mode = HorseCareTaskMode.EXEMPT;
      task.fromDate = '2026-11-08';
      task.toDate = '2026-11-16';
      taskType.appliesToAll = true;

      await service.removeForHorse(headTrainer, task.id);

      expect(manager.update).toHaveBeenCalledWith(
        HorseCareTaskEntity,
        { id: task.id },
        { toDate: '2026-11-08' },
      );
      expect(checklists.ensureChecklist).toHaveBeenCalledWith(
        manager,
        horseId,
        today,
      );
      expect(checklists.addTaskToChecklist).toHaveBeenCalledWith(
        manager,
        horseId,
        today,
        taskType,
      );
    });

    it('returns not found when the task does not exist', async () => {
      manager.findOneBy.mockResolvedValue(null);

      await expect(
        service.removeForHorse(headTrainer, 'missing'),
      ).rejects.toThrow(
        new NotFoundException('Không tìm thấy việc riêng của ngựa'),
      );
      expect(manager.delete).not.toHaveBeenCalled();
    });
  });
});

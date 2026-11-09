import { HttpStatus, RequestMethod } from '@nestjs/common';
import {
  HTTP_CODE_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants';
import { ACCESS_KEY } from '../../../common/constants/auth.constants';
import { UserRole } from '../../../common/enums/role.enum';
import type { Actor } from '../../../common/types/actor';
import {
  CreateCareTaskTypeDto,
  CreateHorseCareTaskDto,
  UpdateCareTaskTypeDto,
} from '../dto/care-task.dto';
import { CareTasksService } from './care-tasks.service';
import { CareTasksController } from './care-tasks.controller';

function handlerOf(method: keyof CareTasksController): object {
  return Object.getOwnPropertyDescriptor(CareTasksController.prototype, method)
    ?.value as object;
}

describe('CareTasksController', () => {
  const actor: Actor = {
    sub: 'kc-trainer',
    roles: [UserRole.HEAD_TRAINER],
  };
  let careTasks: Record<string, jest.Mock>;
  let controller: CareTasksController;

  beforeEach(() => {
    careTasks = {
      listTypes: jest.fn().mockResolvedValue([]),
      createType: jest.fn().mockResolvedValue({ id: 'type-1' }),
      updateType: jest.fn().mockResolvedValue({ id: 'type-1' }),
      listForHorse: jest.fn().mockResolvedValue([]),
      createForHorse: jest.fn().mockResolvedValue({ id: 'task-1' }),
      removeForHorse: jest.fn().mockResolvedValue(undefined),
    };
    controller = new CareTasksController(
      careTasks as unknown as CareTasksService,
    );
  });

  describe('service delegation', () => {
    it('passes the actor to listTypes', async () => {
      const response = [{ id: 'type-1' }];
      careTasks.listTypes.mockResolvedValue(response);

      await expect(controller.listTypes(actor)).resolves.toBe(response);
      expect(careTasks.listTypes).toHaveBeenCalledWith(actor);
    });

    it('passes the actor and new type body to createType', async () => {
      const body = {
        name: 'Vệ sinh móng',
        appliesToAll: true,
      } as CreateCareTaskTypeDto;
      const response = { id: 'type-1' };
      careTasks.createType.mockResolvedValue(response);

      await expect(controller.createType(actor, body)).resolves.toBe(response);
      expect(careTasks.createType).toHaveBeenCalledWith(actor, body);
    });

    it('passes the actor, type id and update body to updateType', async () => {
      const body = { active: false } as UpdateCareTaskTypeDto;
      const response = { id: 'type-1' };
      careTasks.updateType.mockResolvedValue(response);

      await expect(controller.updateType(actor, 'type-1', body)).resolves.toBe(
        response,
      );
      expect(careTasks.updateType).toHaveBeenCalledWith(actor, 'type-1', body);
    });

    it('passes the actor and horse id to listForHorse', async () => {
      const response = [{ id: 'task-1' }];
      careTasks.listForHorse.mockResolvedValue(response);

      await expect(controller.listForHorse(actor, 'horse-1')).resolves.toBe(
        response,
      );
      expect(careTasks.listForHorse).toHaveBeenCalledWith(actor, 'horse-1');
    });

    it('passes the actor, horse id and task body to createForHorse', async () => {
      const body = {
        taskTypeId: 'type-1',
        fromDate: '2026-11-09',
        toDate: '2026-11-16',
      } as CreateHorseCareTaskDto;
      const response = { id: 'task-1' };
      careTasks.createForHorse.mockResolvedValue(response);

      await expect(
        controller.createForHorse(actor, 'horse-1', body),
      ).resolves.toBe(response);
      expect(careTasks.createForHorse).toHaveBeenCalledWith(
        actor,
        'horse-1',
        body,
      );
    });

    it('passes the actor and task id to removeForHorse', async () => {
      await expect(
        controller.removeForHorse(actor, 'task-1'),
      ).resolves.toBeUndefined();
      expect(careTasks.removeForHorse).toHaveBeenCalledWith(actor, 'task-1');
    });
  });

  describe('route access and metadata', () => {
    it.each([
      [
        'listTypes',
        [
          UserRole.CLUB_MANAGER,
          UserRole.HEAD_TRAINER,
          UserRole.VETERINARIAN,
          UserRole.GROOM,
        ],
      ],
      ['createType', [UserRole.CLUB_MANAGER]],
      ['updateType', [UserRole.CLUB_MANAGER]],
      [
        'listForHorse',
        [
          UserRole.CLUB_MANAGER,
          UserRole.HEAD_TRAINER,
          UserRole.VETERINARIAN,
          UserRole.GROOM,
        ],
      ],
      ['createForHorse', [UserRole.HEAD_TRAINER, UserRole.VETERINARIAN]],
      ['removeForHorse', [UserRole.HEAD_TRAINER, UserRole.VETERINARIAN]],
    ] as const)('allows the expected roles for %s', (method, roles) => {
      expect(Reflect.getMetadata(ACCESS_KEY, handlerOf(method))).toEqual(roles);
    });

    it.each([
      ['listTypes', RequestMethod.GET, 'care-task-types'],
      ['createType', RequestMethod.POST, 'care-task-types'],
      ['updateType', RequestMethod.PATCH, 'care-task-types/:id'],
      ['listForHorse', RequestMethod.GET, 'horses/:horseId/care-tasks'],
      ['createForHorse', RequestMethod.POST, 'horses/:horseId/care-tasks'],
      ['removeForHorse', RequestMethod.DELETE, 'horse-care-tasks/:id'],
    ] as const)('maps %s to %s %s', (method, httpMethod, path) => {
      const handler = handlerOf(method);
      expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(httpMethod);
      expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe(path);
    });

    it('returns 204 for removing a task', () => {
      expect(
        Reflect.getMetadata(HTTP_CODE_METADATA, handlerOf('removeForHorse')),
      ).toBe(HttpStatus.NO_CONTENT);
    });
  });
});

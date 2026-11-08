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
  BarnListQueryDto,
  CreateBarnDto,
  UpdateBarnDto,
} from '../dto/barn.dto';
import { BarnsService } from './barns.service';
import { BarnsController } from './barns.controller';

function handlerOf(method: keyof BarnsController): object {
  return Object.getOwnPropertyDescriptor(BarnsController.prototype, method)
    ?.value as object;
}

describe('BarnsController', () => {
  const actor: Actor = {
    sub: 'kc-manager',
    roles: [UserRole.CLUB_MANAGER],
  };
  let barnsService: Record<string, jest.Mock>;
  let controller: BarnsController;

  beforeEach(() => {
    barnsService = {
      list: jest.fn().mockResolvedValue([]),
      get: jest.fn().mockResolvedValue({ id: 'barn-1' }),
      create: jest.fn().mockResolvedValue({ id: 'barn-1' }),
      update: jest.fn().mockResolvedValue({ id: 'barn-1' }),
      remove: jest.fn().mockResolvedValue(undefined),
    };
    controller = new BarnsController(barnsService as unknown as BarnsService);
  });

  describe('service delegation', () => {
    it('passes the actor and filters to list', async () => {
      const query = { mine: true } as BarnListQueryDto;
      const response = [{ id: 'barn-1' }];
      barnsService.list.mockResolvedValue(response);

      await expect(controller.list(actor, query)).resolves.toBe(response);
      expect(barnsService.list).toHaveBeenCalledWith(actor, query);
    });

    it('passes the actor and barn id to get', async () => {
      const response = { id: 'barn-1' };
      barnsService.get.mockResolvedValue(response);

      await expect(controller.get(actor, 'barn-1')).resolves.toBe(response);
      expect(barnsService.get).toHaveBeenCalledWith(actor, 'barn-1');
    });

    it('passes the actor and creation body to create', async () => {
      const body = { name: 'Khu A' } as CreateBarnDto;
      const response = { id: 'barn-1' };
      barnsService.create.mockResolvedValue(response);

      await expect(controller.create(actor, body)).resolves.toBe(response);
      expect(barnsService.create).toHaveBeenCalledWith(actor, body);
    });

    it('passes the actor, barn id and update body to update', async () => {
      const body = { description: 'Khu tập luyện' } as UpdateBarnDto;
      const response = { id: 'barn-1' };
      barnsService.update.mockResolvedValue(response);

      await expect(controller.update(actor, 'barn-1', body)).resolves.toBe(
        response,
      );
      expect(barnsService.update).toHaveBeenCalledWith(actor, 'barn-1', body);
    });

    it('passes the actor and barn id to remove', async () => {
      await expect(controller.remove(actor, 'barn-1')).resolves.toBeUndefined();
      expect(barnsService.remove).toHaveBeenCalledWith(actor, 'barn-1');
    });
  });

  describe('route access and metadata', () => {
    it.each([
      [
        'list',
        [
          UserRole.CLUB_MANAGER,
          UserRole.HEAD_TRAINER,
          UserRole.VETERINARIAN,
          UserRole.GROOM,
        ],
      ],
      [
        'get',
        [
          UserRole.CLUB_MANAGER,
          UserRole.HEAD_TRAINER,
          UserRole.VETERINARIAN,
          UserRole.GROOM,
        ],
      ],
      ['create', [UserRole.CLUB_MANAGER]],
      ['update', [UserRole.CLUB_MANAGER]],
      ['remove', [UserRole.CLUB_MANAGER]],
    ] as const)('allows the expected roles for %s', (method, roles) => {
      expect(Reflect.getMetadata(ACCESS_KEY, handlerOf(method))).toEqual(roles);
    });

    it.each([
      ['list', RequestMethod.GET, ''],
      ['get', RequestMethod.GET, ':id'],
      ['create', RequestMethod.POST, ''],
      ['update', RequestMethod.PATCH, ':id'],
      ['remove', RequestMethod.DELETE, ':id'],
    ] as const)('maps %s to %s %s', (method, httpMethod, path) => {
      const handler = handlerOf(method);
      expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(httpMethod);
      expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe(path);
    });

    it('returns 204 for removing a barn', () => {
      expect(Reflect.getMetadata(HTTP_CODE_METADATA, handlerOf('remove'))).toBe(
        HttpStatus.NO_CONTENT,
      );
    });
  });
});

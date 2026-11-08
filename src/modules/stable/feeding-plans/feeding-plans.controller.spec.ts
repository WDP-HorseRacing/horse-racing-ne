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
  CreateFeedingPlansDto,
  FeedingPlanListQueryDto,
  ReplaceFeedingPlanDto,
} from '../dto/feeding-plan.dto';
import { FeedingPlanStatus } from '../constants/feeding-plan-status.enum';
import { FeedingPlansService } from './feeding-plans.service';
import { FeedingPlansController } from './feeding-plans.controller';

function handlerOf(method: keyof FeedingPlansController): object {
  return Object.getOwnPropertyDescriptor(
    FeedingPlansController.prototype,
    method,
  )?.value as object;
}

describe('FeedingPlansController', () => {
  const actor: Actor = {
    sub: 'kc-head-trainer',
    roles: [UserRole.HEAD_TRAINER],
  };
  let plans: Record<string, jest.Mock>;
  let controller: FeedingPlansController;

  beforeEach(() => {
    plans = {
      listForHorse: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockResolvedValue([]),
      get: jest.fn().mockResolvedValue({ id: 'plan-1' }),
      replace: jest.fn().mockResolvedValue({ id: 'plan-1' }),
      remove: jest.fn().mockResolvedValue(undefined),
      approve: jest.fn().mockResolvedValue({ id: 'plan-1' }),
    };
    controller = new FeedingPlansController(
      plans as unknown as FeedingPlansService,
    );
  });

  describe('service delegation', () => {
    it('passes the actor, horse id and query to listForHorse', async () => {
      const query: FeedingPlanListQueryDto = {
        status: FeedingPlanStatus.DRAFT,
      };
      const response = [{ id: 'plan-1' }];
      plans.listForHorse.mockResolvedValue(response);

      await expect(
        controller.listForHorse(actor, 'horse-1', query),
      ).resolves.toBe(response);
      expect(plans.listForHorse).toHaveBeenCalledWith(actor, 'horse-1', query);
    });

    it('passes the actor and create body to create', async () => {
      const body = {
        horseIds: ['horse-1'],
        items: [],
      } as unknown as CreateFeedingPlansDto;
      const response = [{ id: 'plan-1' }];
      plans.create.mockResolvedValue(response);

      await expect(controller.create(actor, body)).resolves.toBe(response);
      expect(plans.create).toHaveBeenCalledWith(actor, body);
    });

    it('passes the actor and plan id to get', async () => {
      const response = { id: 'plan-1' };
      plans.get.mockResolvedValue(response);

      await expect(controller.get(actor, 'plan-1')).resolves.toBe(response);
      expect(plans.get).toHaveBeenCalledWith(actor, 'plan-1');
    });

    it('passes the actor, plan id and replacement body to replace', async () => {
      const body = { items: [] } as unknown as ReplaceFeedingPlanDto;
      const response = { id: 'plan-1' };
      plans.replace.mockResolvedValue(response);

      await expect(controller.replace(actor, 'plan-1', body)).resolves.toBe(
        response,
      );
      expect(plans.replace).toHaveBeenCalledWith(actor, 'plan-1', body);
    });

    it('passes the actor and plan id to remove', async () => {
      await expect(controller.remove(actor, 'plan-1')).resolves.toBeUndefined();
      expect(plans.remove).toHaveBeenCalledWith(actor, 'plan-1');
    });

    it('passes the actor and plan id to approve', async () => {
      const response = { id: 'plan-1' };
      plans.approve.mockResolvedValue(response);

      await expect(controller.approve(actor, 'plan-1')).resolves.toBe(response);
      expect(plans.approve).toHaveBeenCalledWith(actor, 'plan-1');
    });
  });

  describe('route access', () => {
    it.each([
      [
        'listForHorse',
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
      ['create', [UserRole.HEAD_TRAINER]],
      ['replace', [UserRole.HEAD_TRAINER]],
      ['remove', [UserRole.HEAD_TRAINER]],
      ['approve', [UserRole.HEAD_TRAINER]],
    ] as const)('restricts %s to its permitted roles', (method, roles) => {
      expect(Reflect.getMetadata(ACCESS_KEY, handlerOf(method))).toEqual(roles);
    });

    it.each([
      ['listForHorse', RequestMethod.GET, 'horses/:horseId/feeding-plans'],
      ['create', RequestMethod.POST, 'feeding-plans'],
      ['get', RequestMethod.GET, 'feeding-plans/:id'],
      ['replace', RequestMethod.PUT, 'feeding-plans/:id'],
      ['remove', RequestMethod.DELETE, 'feeding-plans/:id'],
      ['approve', RequestMethod.POST, 'feeding-plans/:id/approve'],
    ] as const)('maps %s to %s %s', (method, httpMethod, path) => {
      const handler = handlerOf(method);
      expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(httpMethod);
      expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe(path);
    });

    it('returns 204 for removal and 200 for approval', () => {
      expect(Reflect.getMetadata(HTTP_CODE_METADATA, handlerOf('remove'))).toBe(
        HttpStatus.NO_CONTENT,
      );
      expect(
        Reflect.getMetadata(HTTP_CODE_METADATA, handlerOf('approve')),
      ).toBe(HttpStatus.OK);
    });
  });
});

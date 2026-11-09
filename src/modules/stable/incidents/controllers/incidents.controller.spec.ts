import { HttpStatus, RequestMethod } from '@nestjs/common';
import {
  HTTP_CODE_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants';
import { ACCESS_KEY } from '../../../../common/constants/auth.constants';
import { UserRole } from '../../../../common/enums/role.enum';
import type { Actor } from '../../../../common/types/actor';
import {
  IncidentListQueryDto,
  ReferIncidentDto,
  ReportIncidentDto,
} from '../../dto/incident.dto';
import { IncidentStatus } from '../../constants/incident-status.enum';
import { IncidentsService } from '../services/incidents.service';
import { IncidentsController } from './incidents.controller';

function handlerOf(method: keyof IncidentsController): object {
  return Object.getOwnPropertyDescriptor(IncidentsController.prototype, method)
    ?.value as object;
}

describe('IncidentsController', () => {
  const actor: Actor = { sub: 'kc-groom', roles: [UserRole.GROOM] };
  let incidents: Record<string, jest.Mock>;
  let controller: IncidentsController;

  beforeEach(() => {
    incidents = {
      list: jest.fn().mockResolvedValue({ items: [], meta: {} }),
      report: jest.fn().mockResolvedValue({ id: 'incident-1' }),
      get: jest.fn().mockResolvedValue({ id: 'incident-1' }),
      refer: jest.fn().mockResolvedValue({ id: 'incident-1' }),
      resolve: jest.fn().mockResolvedValue({ id: 'incident-1' }),
    };
    controller = new IncidentsController(
      incidents as unknown as IncidentsService,
    );
  });

  describe('service delegation', () => {
    it('passes actor and filters to list', async () => {
      const query = Object.assign(new IncidentListQueryDto(), {
        status: IncidentStatus.OPEN,
        horseId: 'horse-1',
      });
      const response = { items: [{ id: 'incident-1' }], meta: {} };
      incidents.list.mockResolvedValue(response);

      await expect(controller.list(actor, query)).resolves.toBe(response);
      expect(incidents.list).toHaveBeenCalledWith(actor, query);
    });

    it('passes actor and report body to report', async () => {
      const body = {
        horseId: 'horse-1',
        description: 'Đau chân',
        urgent: true,
      } as ReportIncidentDto;
      const response = { id: 'incident-1' };
      incidents.report.mockResolvedValue(response);

      await expect(controller.report(actor, body)).resolves.toBe(response);
      expect(incidents.report).toHaveBeenCalledWith(actor, body);
    });

    it('passes actor and incident id to get', async () => {
      const response = { id: 'incident-1' };
      incidents.get.mockResolvedValue(response);

      await expect(controller.get(actor, 'incident-1')).resolves.toBe(response);
      expect(incidents.get).toHaveBeenCalledWith(actor, 'incident-1');
    });

    it('passes actor, incident id and referral body to refer', async () => {
      const body = { urgent: true } as ReferIncidentDto;
      const response = { id: 'incident-1' };
      incidents.refer.mockResolvedValue(response);

      await expect(controller.refer(actor, 'incident-1', body)).resolves.toBe(
        response,
      );
      expect(incidents.refer).toHaveBeenCalledWith(actor, 'incident-1', body);
    });

    it('passes actor, incident id and resolution body to resolve', async () => {
      const body = { resolution: 'Đã xử lý' };
      const response = { id: 'incident-1' };
      incidents.resolve.mockResolvedValue(response);

      await expect(controller.resolve(actor, 'incident-1', body)).resolves.toBe(
        response,
      );
      expect(incidents.resolve).toHaveBeenCalledWith(actor, 'incident-1', body);
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
      ['report', [UserRole.GROOM]],
      ['refer', [UserRole.HEAD_TRAINER]],
      ['resolve', [UserRole.HEAD_TRAINER]],
    ] as const)('allows the expected roles for %s', (method, roles) => {
      expect(Reflect.getMetadata(ACCESS_KEY, handlerOf(method))).toEqual(roles);
    });

    it.each([
      ['list', RequestMethod.GET, 'incidents'],
      ['report', RequestMethod.POST, 'incidents'],
      ['get', RequestMethod.GET, 'incidents/:id'],
      ['refer', RequestMethod.POST, 'incidents/:id/refer'],
      ['resolve', RequestMethod.POST, 'incidents/:id/resolve'],
    ] as const)('maps %s to %s %s', (method, httpMethod, path) => {
      const handler = handlerOf(method);
      expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(httpMethod);
      expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe(path);
    });

    it('returns 200 for refer and resolve', () => {
      expect(Reflect.getMetadata(HTTP_CODE_METADATA, handlerOf('refer'))).toBe(
        HttpStatus.OK,
      );
      expect(
        Reflect.getMetadata(HTTP_CODE_METADATA, handlerOf('resolve')),
      ).toBe(HttpStatus.OK);
    });
  });
});

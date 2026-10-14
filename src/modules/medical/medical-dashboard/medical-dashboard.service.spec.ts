import { ForbiddenException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { UserRole } from '../../../common/enums/role.enum';
import { HorseHealthStatus } from '../../horses/enums/horse-status.enum';
import { HorseAccessService } from '../../horses/shared/horse-access.service';
import { StableAccessService } from '../../stable/shared/stable-access.service';
import { CheckupDueStatus } from '../constants/checkup.enum';
import { MedicalCheckupsService } from '../shared/medical-checkups.service';
import { MedicalDashboardRepository } from './medical-dashboard.repository';
import { MedicalDashboardService } from './medical-dashboard.service';

const horse = (horseId: string, healthStatus: HorseHealthStatus) => ({
  horseId,
  horseName: horseId,
  barnId: 'b1',
  barnName: 'Khu A',
  healthStatus,
  stallId: null,
  stallCode: null,
  lastVisitDate: null,
  createdDate: '2026-09-01',
  reactivatedDate: null,
});

describe('MedicalDashboardService', () => {
  let shared: { herdCheckupAnchors: jest.Mock; dueCareSchedules: jest.Mock };
  let checkups: { checkupItemsFor: jest.Mock };
  let dashboard: { openCases: jest.Mock };
  let requests: { find: jest.Mock };
  let stableAccess: {
    isBarnScopedTrainer: jest.Mock;
    trainerBarnIds: jest.Mock;
  };
  let service: MedicalDashboardService;

  beforeEach(() => {
    stableAccess = {
      isBarnScopedTrainer: jest.fn(
        (actor: { roles: UserRole[] }) =>
          actor.roles.includes(UserRole.HEAD_TRAINER) &&
          !actor.roles.includes(UserRole.CLUB_MANAGER),
      ),
      trainerBarnIds: jest.fn().mockResolvedValue(['b1', 'b3']),
    };
    shared = {
      herdCheckupAnchors: jest
        .fn()
        .mockResolvedValue([
          horse('Bạch', HorseHealthStatus.ELIGIBLE),
          horse('An', HorseHealthStatus.UNDER_OBSERVATION),
          horse('Cúc', HorseHealthStatus.INJURED),
          horse('Dạ', HorseHealthStatus.QUARANTINED),
          horse('Ánh', HorseHealthStatus.ELIGIBLE),
        ]),
      dueCareSchedules: jest.fn().mockResolvedValue([]),
    };
    checkups = {
      checkupItemsFor: jest.fn().mockResolvedValue([
        { horseId: 'Cúc', dueStatus: CheckupDueStatus.OVERDUE },
        { horseId: 'An', dueStatus: CheckupDueStatus.DUE_SOON },
        { horseId: 'Bạch', dueStatus: CheckupDueStatus.OK },
      ]),
    };
    dashboard = { openCases: jest.fn().mockResolvedValue([]) };
    requests = { find: jest.fn().mockResolvedValue([]) };
    service = new MedicalDashboardService(
      {
        currentUser: jest.fn().mockResolvedValue({ id: 'u1' }),
      } as unknown as HorseAccessService,
      { ...shared, ...checkups } as unknown as MedicalCheckupsService,
      dashboard as unknown as MedicalDashboardRepository,
      { manager: requests } as unknown as DataSource,
      stableAccess as unknown as StableAccessService,
    );
  });

  it('counts the herd by health status and lists quarantined and injured first', async () => {
    const result = await service.get(
      { sub: 'kc-vet', roles: [UserRole.VETERINARIAN] },
      {},
    );
    expect(result.herd.counts).toEqual({
      QUARANTINED: 1,
      INJURED: 1,
      UNDER_OBSERVATION: 1,
      ELIGIBLE: 2,
    });
    expect(result.herd.horses.map((item) => item.horseId)).toEqual([
      'Dạ',
      'Cúc',
      'An',
      'Ánh',
      'Bạch',
    ]);
  });

  it('keeps only overdue and due-soon checkups', async () => {
    const result = await service.get(
      { sub: 'kc-vet', roles: [UserRole.VETERINARIAN] },
      {},
    );
    expect(result.checkups.map((item) => item.horseId)).toEqual(['Cúc', 'An']);
  });

  it('filters the barn in the query and the health status in memory for every block', async () => {
    const filter = { barnId: 'b2', healthStatus: HorseHealthStatus.INJURED };
    await service.get({ sub: 'kc-cm', roles: [UserRole.CLUB_MANAGER] }, filter);
    expect(shared.herdCheckupAnchors).toHaveBeenCalledWith({ barnId: 'b2' });
    expect(shared.herdCheckupAnchors).toHaveBeenCalledTimes(1);
    expect(checkups.checkupItemsFor).toHaveBeenCalledWith(
      [expect.objectContaining({ horseId: 'Cúc' })],
      expect.any(String),
    );
    expect(dashboard.openCases).toHaveBeenCalledWith(['Cúc']);
    expect(shared.dueCareSchedules).toHaveBeenCalledWith(expect.any(String), [
      'Cúc',
    ]);
  });

  it('keeps all four counts when the health status filter is set, and lists only that status', async () => {
    const result = await service.get(
      { sub: 'kc-vet', roles: [UserRole.VETERINARIAN] },
      { healthStatus: HorseHealthStatus.INJURED },
    );
    expect(result.herd.counts).toEqual({
      QUARANTINED: 1,
      INJURED: 1,
      UNDER_OBSERVATION: 1,
      ELIGIBLE: 2,
    });
    expect(result.herd.horses.map((item) => item.horseId)).toEqual(['Cúc']);
  });

  it('skips the request query when no horse matches', async () => {
    shared.herdCheckupAnchors.mockResolvedValue([]);
    const result = await service.get(
      { sub: 'kc-vet', roles: [UserRole.VETERINARIAN] },
      {},
    );
    expect(requests.find).not.toHaveBeenCalled();
    expect(result.pendingRequests).toEqual([]);
  });

  describe('head trainer scope', () => {
    const trainer = { sub: 'kc-ht', roles: [UserRole.HEAD_TRAINER] };

    it('shows only the barns the head trainer runs', async () => {
      await service.get(trainer, {});
      expect(stableAccess.trainerBarnIds).toHaveBeenCalledWith(requests, 'u1');
      expect(shared.herdCheckupAnchors).toHaveBeenCalledWith({
        barnIds: ['b1', 'b3'],
      });
    });

    it('accepts one of their own barns', async () => {
      await service.get(trainer, { barnId: 'b3' });
      expect(shared.herdCheckupAnchors).toHaveBeenCalledWith({ barnId: 'b3' });
    });

    it('rejects another barn with 403 before reading the herd', async () => {
      await expect(service.get(trainer, { barnId: 'b2' })).rejects.toThrow(
        ForbiddenException,
      );
      expect(shared.herdCheckupAnchors).not.toHaveBeenCalled();
    });

    it('does not limit a head trainer who is also club manager', async () => {
      await service.get(
        { sub: 'kc-x', roles: [UserRole.HEAD_TRAINER, UserRole.CLUB_MANAGER] },
        {},
      );
      expect(shared.herdCheckupAnchors).toHaveBeenCalledWith({});
      expect(stableAccess.trainerBarnIds).not.toHaveBeenCalled();
    });
  });
});

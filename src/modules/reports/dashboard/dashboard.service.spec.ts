import { BadRequestException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { UserRole } from '../../../common/enums/role.enum';
import type { Actor } from '../../../common/types/actor';
import { currentUserForActor } from '../../users/utils/current-user';
import {
  HorseHealthStatus,
  HorseLifecycleStatus,
} from '../../horses/enums/horse-status.enum';
import { SessionParticipantStatus } from '../../training/enums/session-participant-status.enum';
import { TrainingIntensity } from '../../training/enums/training-intensity.enum';
import { DashboardQueryDto } from '../dto/dashboard.dto';
import type { MetricGroupRow } from '../types/report.types';
import { ReportsAccessService } from '../shared/reports-access.service';
import { DashboardRepository } from './dashboard.repository';
import { DashboardService } from './dashboard.service';

jest.mock('../../users/utils/current-user', () => ({
  currentUserForActor: jest.fn(),
}));

describe('DashboardService', () => {
  const actor: Actor = {
    sub: 'kc-trainer',
    roles: [UserRole.HEAD_TRAINER],
  };
  let repository: {
    horses: jest.Mock;
    participantCounts: jest.Mock;
    sessionCount: jest.Mock;
  };
  let reportsAccess: { groupMetrics: jest.Mock };
  let service: DashboardService;

  beforeEach(() => {
    jest.mocked(currentUserForActor).mockResolvedValue({
      id: 'trainer-1',
      role: UserRole.HEAD_TRAINER,
    } as never);
    repository = {
      horses: jest.fn().mockResolvedValue([
        {
          horseId: 'horse-1',
          horseName: 'Mây',
          lifecycleStatus: HorseLifecycleStatus.ACTIVE,
          barnId: 'barn-1',
          barnName: 'Khu A',
          healthStatus: HorseHealthStatus.ELIGIBLE,
          trainingLocked: true,
          latestWeightKg: '480.5',
        },
      ]),
      participantCounts: jest.fn().mockResolvedValue([
        {
          horseId: 'horse-1',
          status: SessionParticipantStatus.COMPLETED,
          intensity: TrainingIntensity.LIGHT,
          weekStart: '2026-11-02',
          count: 2,
        },
      ]),
      sessionCount: jest.fn().mockResolvedValue(3),
    };
    const horseMetrics: MetricGroupRow[] = [
      {
        key: 'horse-1',
        count: 2,
        sumHeartRateBpm: 240,
        maxHeartRateBpm: 130,
        sumSpeedMps: '4.4',
        maxSpeedMps: '2.5',
        alertCount: 1,
      },
    ];
    const weekMetrics: MetricGroupRow[] = [
      {
        ...horseMetrics[0],
        key: '2026-11-02',
      },
    ];
    reportsAccess = {
      groupMetrics: jest.fn((_ids, _period, grouping: string) =>
        Promise.resolve(grouping === 'HORSE' ? horseMetrics : weekMetrics),
      ),
    };
    service = new DashboardService(
      repository as unknown as DashboardRepository,
      reportsAccess as unknown as ReportsAccessService,
      { manager: {} } as unknown as DataSource,
    );
  });

  it('scopes the horse query and combines training and metric summaries', async () => {
    const query: DashboardQueryDto = {
      from: '2026-11-01',
      to: '2026-11-08',
      barnId: 'barn-1',
      mine: true,
    };

    const result = await service.get(actor, query);

    expect(repository.horses).toHaveBeenCalledWith(
      { barnId: 'barn-1', headTrainerId: 'trainer-1' },
      expect.objectContaining({ from: query.from, to: query.to }),
    );
    expect(repository.participantCounts).toHaveBeenCalledWith(
      ['horse-1'],
      expect.objectContaining({ from: query.from, to: query.to }),
    );
    expect(repository.sessionCount).toHaveBeenCalledWith(
      ['horse-1'],
      expect.objectContaining({ from: query.from, to: query.to }),
    );
    expect(reportsAccess.groupMetrics).toHaveBeenNthCalledWith(
      1,
      ['horse-1'],
      expect.objectContaining({ from: query.from, to: query.to }),
      'HORSE',
    );
    expect(reportsAccess.groupMetrics).toHaveBeenNthCalledWith(
      2,
      ['horse-1'],
      expect.objectContaining({ from: query.from, to: query.to }),
      'WEEK',
    );
    expect(result).toMatchObject({
      from: query.from,
      to: query.to,
      herd: {
        total: 1,
        trainingLocked: 1,
        byHealthStatus: { ELIGIBLE: 1 },
      },
      training: {
        sessions: 3,
        completed: 2,
        completedByIntensity: { LIGHT: 2, HEAVY: 0 },
      },
      horses: [
        {
          horseId: 'horse-1',
          avgHeartRateBpm: 120,
          latestWeightKg: 480.5,
        },
      ],
      weekly: [{ weekStart: '2026-11-02', completed: 2, alertCount: 1 }],
    });
  });

  it('rejects a reversed period before querying the repository', async () => {
    await expect(
      service.get(actor, { from: '2026-11-09', to: '2026-11-08' }),
    ).rejects.toThrow(BadRequestException);
    expect(repository.horses).not.toHaveBeenCalled();
  });
});

import { NotFoundException } from '@nestjs/common';
import { UserRole } from '../../../common/enums/role.enum';
import type { Actor } from '../../../common/types/actor';
import { HorseAccessService } from '../../horses/shared/horse-access.service';
import { EvaluationsService } from '../../training/trainging-evaluations/training-evaluations.service';
import { PerformanceRepository } from '../repositories/performance.repository';
import { PerformanceService } from './performance.service';

const owner: Actor = { sub: 'kc-owner', roles: [UserRole.HORSE_OWNER] };

describe('PerformanceService', () => {
  let repository: Record<string, jest.Mock>;
  let horseAccess: { findReadable: jest.Mock };
  let evaluations: { listLatestByHorse: jest.Mock };
  let service: PerformanceService;

  beforeEach(() => {
    horseAccess = { findReadable: jest.fn().mockResolvedValue({ id: 'h1' }) };
    repository = {
      sessionSummaries: jest.fn().mockResolvedValue([
        {
          sessionId: 'session-1',
          scheduledAt: new Date('2026-09-18T06:00:00Z'),
          avgHeartRateBpm: 142,
          maxHeartRateBpm: 198,
          avgSpeedMps: '11.250',
          maxSpeedMps: '16.800',
          alertCount: 2,
        },
      ]),
      listMetrics: jest.fn().mockResolvedValue([]),
    };
    evaluations = { listLatestByHorse: jest.fn().mockResolvedValue([]) };
    service = new PerformanceService(
      repository as unknown as PerformanceRepository,
      horseAccess as unknown as HorseAccessService,
      evaluations as unknown as EvaluationsService,
    );
  });

  it('returns the per-session summary of a readable horse', async () => {
    const [row] = await service.listSessionSummaries(owner, 'h1');
    expect(row).toMatchObject({ sessionId: 'session-1', alertCount: 2 });
    expect(horseAccess.findReadable).toHaveBeenCalledWith(owner, 'h1');
  });

  it('returns the raw summary of a readable horse', async () => {
    await service.getHorseSummary(owner, 'h1');
    expect(horseAccess.findReadable).toHaveBeenCalledWith(owner, 'h1');
    expect(repository.listMetrics).toHaveBeenCalledWith('h1');
    expect(evaluations.listLatestByHorse).toHaveBeenCalledWith('h1');
  });

  it('answers not found for the per-session summary of a horse outside the caller scope', async () => {
    horseAccess.findReadable.mockRejectedValue(new NotFoundException());
    await expect(service.listSessionSummaries(owner, 'h1')).rejects.toThrow(
      NotFoundException,
    );
    expect(repository.sessionSummaries).not.toHaveBeenCalled();
  });

  it('answers not found for the raw summary of a horse outside the caller scope', async () => {
    horseAccess.findReadable.mockRejectedValue(new NotFoundException());
    await expect(service.getHorseSummary(owner, 'h1')).rejects.toThrow(
      NotFoundException,
    );
    expect(repository.listMetrics).not.toHaveBeenCalled();
  });
});

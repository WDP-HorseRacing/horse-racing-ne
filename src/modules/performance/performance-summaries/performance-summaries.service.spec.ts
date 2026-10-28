import { NotFoundException } from '@nestjs/common';
import { UserRole } from '../../../common/enums/role.enum';
import type { Actor } from '../../../common/types/actor';
import { HorseAccessService } from '../../horses/shared/horse-access.service';
import { PerformanceSummariesRepository } from './performance-summaries.repository';
import { PerformanceSummariesService } from './performance-summaries.service';

const owner: Actor = { sub: 'kc-owner', roles: [UserRole.HORSE_OWNER] };

describe('PerformanceSummariesService', () => {
  let repository: Record<string, jest.Mock>;
  let horseAccess: { findReadableHorseForActor: jest.Mock };
  let service: PerformanceSummariesService;

  beforeEach(() => {
    horseAccess = { findReadableHorseForActor: jest.fn().mockResolvedValue({ id: 'h1' }) };
    repository = {
      sessionSummaries: jest.fn().mockResolvedValue([
        {
          sessionParticipantId: 'participant-1',
          sessionId: 'session-1',
          scheduledAt: new Date('2026-09-18T06:00:00Z'),
          count: 2,
          sumHeartRateBpm: 284,
          maxHeartRateBpm: 198,
          sumSpeedMps: '22.5',
          maxSpeedMps: '16.8',
          alertCount: 2,
        },
      ]),
      listMetrics: jest.fn().mockResolvedValue([]),
      listEvaluations: jest.fn().mockResolvedValue([]),
    };
    service = new PerformanceSummariesService(
      repository as unknown as PerformanceSummariesRepository,
      horseAccess as unknown as HorseAccessService,
    );
  });

  it('returns the per-session summary of a readable horse', async () => {
    const [row] = await service.listSessionSummaries(owner, 'h1');
    expect(row).toMatchObject({ sessionId: 'session-1', alertCount: 2 });
    expect(horseAccess.findReadableHorseForActor).toHaveBeenCalledWith(owner, 'h1');
  });

  it('returns the raw summary of a readable horse', async () => {
    await service.getHorseSummary(owner, 'h1');
    expect(horseAccess.findReadableHorseForActor).toHaveBeenCalledWith(owner, 'h1');
    expect(repository.listMetrics).toHaveBeenCalledWith('h1');
    expect(repository.listEvaluations).toHaveBeenCalledWith('h1');
  });

  it('answers not found for the per-session summary of a horse outside the caller scope', async () => {
    horseAccess.findReadableHorseForActor.mockRejectedValue(new NotFoundException());
    await expect(service.listSessionSummaries(owner, 'h1')).rejects.toThrow(
      NotFoundException,
    );
    expect(repository.sessionSummaries).not.toHaveBeenCalled();
  });

  it('answers not found for the raw summary of a horse outside the caller scope', async () => {
    horseAccess.findReadableHorseForActor.mockRejectedValue(new NotFoundException());
    await expect(service.getHorseSummary(owner, 'h1')).rejects.toThrow(
      NotFoundException,
    );
    expect(repository.listMetrics).not.toHaveBeenCalled();
  });
});

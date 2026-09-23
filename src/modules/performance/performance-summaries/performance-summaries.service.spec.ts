import { NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { UserRole } from '../../../common/enums/role.enum';
import { UserStatus } from '../../../common/enums/user-status.enum';
import type { Actor } from '../../../common/types/actor';
import { findReadableHorse } from '../../horses/utils/horse-access';
import { PerformanceSummariesRepository } from './performance-summaries.repository';
import { PerformanceSummariesService } from './performance-summaries.service';

jest.mock('../../horses/utils/horse-access');
const findReadableHorseMock = jest.mocked(findReadableHorse);

const owner: Actor = { sub: 'kc-owner', roles: [UserRole.HORSE_OWNER] };

describe('PerformanceSummariesService', () => {
  let repository: Record<string, jest.Mock>;
  let service: PerformanceSummariesService;

  beforeEach(() => {
    findReadableHorseMock.mockReset();
    findReadableHorseMock.mockResolvedValue({ id: 'h1' } as never);
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
      listEvaluations: jest.fn().mockResolvedValue([]),
    };
    const dataSource = {
      manager: {
        findOne: jest.fn().mockResolvedValue({
          id: 'user-1',
          status: UserStatus.ACTIVE,
          role: UserRole.HORSE_OWNER,
        }),
      },
    } as unknown as DataSource;
    service = new PerformanceSummariesService(
      repository as unknown as PerformanceSummariesRepository,
      dataSource,
    );
  });

  it('returns the per-session summary of a readable horse', async () => {
    const [row] = await service.listSessionSummaries(owner, 'h1');
    expect(row).toMatchObject({ sessionId: 'session-1', alertCount: 2 });
    expect(findReadableHorseMock).toHaveBeenCalledWith(
      expect.anything(),
      owner,
      'user-1',
      'h1',
    );
  });

  it('answers not found for the per-session summary of a horse outside the caller scope', async () => {
    findReadableHorseMock.mockRejectedValue(new NotFoundException());
    await expect(service.listSessionSummaries(owner, 'h1')).rejects.toThrow(
      NotFoundException,
    );
    expect(repository.sessionSummaries).not.toHaveBeenCalled();
  });

  it('answers not found for the raw summary of a horse outside the caller scope', async () => {
    findReadableHorseMock.mockRejectedValue(new NotFoundException());
    await expect(service.getHorseSummary(owner, 'h1')).rejects.toThrow(
      NotFoundException,
    );
    expect(repository.listMetrics).not.toHaveBeenCalled();
  });
});

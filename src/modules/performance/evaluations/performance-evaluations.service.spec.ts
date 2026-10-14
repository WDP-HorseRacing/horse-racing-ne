import { DataSource, Repository } from 'typeorm';
import type { Actor } from '../../../common/types/actor';
import { TrainingAccessService } from '../../training/shared/training-access.service';
import { TrainingOperationsFacade } from '../../training/shared/training-operations.facade';
import { PerformanceEvaluationEntity } from '../entities/performance-evaluation.entity';
import { PerformanceEvaluationsService } from './performance-evaluations.service';

describe('PerformanceEvaluationsService.create', () => {
  const actor = { sub: 'kc-ht' } as Actor;
  const manager = {
    findOneBy: jest.fn().mockResolvedValue(null),
    create: jest.fn((_entity: unknown, row: object) => ({ id: 'e1', ...row })),
    save: jest.fn((row: object) => Promise.resolve(row)),
  };
  const audit = { record: jest.fn() };
  const service = new PerformanceEvaluationsService(
    {} as Repository<PerformanceEvaluationEntity>,
    {
      currentUser: jest.fn().mockResolvedValue({ id: 'ht-1' }),
      findParticipant: jest.fn().mockResolvedValue({ id: 'p1' }),
      assertCanOperateParticipant: jest.fn(),
    } as unknown as TrainingAccessService,
    {
      assertParticipantCompleted: jest.fn(),
    } as unknown as TrainingOperationsFacade,
    {
      transaction: (work: (m: typeof manager) => Promise<unknown>) =>
        work(manager),
    } as unknown as DataSource,
    audit,
  );

  it('logs the evaluation with its score and comment', async () => {
    await service.create(actor, 'p1', { score: 8, comment: 'Tốt' });

    expect(audit.record).toHaveBeenCalledWith(manager, {
      actorId: 'ht-1',
      action: 'CREATE',
      entityType: 'PERFORMANCE_EVALUATION',
      entityId: 'e1',
      before: null,
      after: { sessionParticipantId: 'p1', score: 8, comment: 'Tốt' },
      feature: 'PERF_EVAL',
    });
  });
});

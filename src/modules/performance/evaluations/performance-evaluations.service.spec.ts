import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import type { Actor } from '../../../common/types/actor';
import { TrainingSessionStatus } from '../../training/enums/training-session-status.enum';
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
      assertParticipantFinished: jest.fn(),
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

describe('PerformanceEvaluationsService.update', () => {
  const actor = { sub: 'kc-ht' } as Actor;
  const endedSession = (overrides: object = {}) => ({
    id: 's1',
    status: TrainingSessionStatus.COMPLETED,
    scheduledEndAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
    ...overrides,
  });
  let manager: { findOne: jest.Mock; save: jest.Mock };
  let access: {
    currentUser: jest.Mock;
    findParticipant: jest.Mock;
    assertCanOperateParticipant: jest.Mock;
    lockedSession: jest.Mock;
  };
  let audit: { record: jest.Mock };
  let service: PerformanceEvaluationsService;

  beforeEach(() => {
    manager = {
      findOne: jest.fn().mockResolvedValue({
        id: 'e1',
        sessionParticipantId: 'p1',
        evaluatorId: 'ht-9',
        score: 6,
        comment: 'Ổn',
      }),
      save: jest.fn((row: object) => Promise.resolve(row)),
    };
    access = {
      currentUser: jest.fn().mockResolvedValue({ id: 'ht-1' }),
      findParticipant: jest
        .fn()
        .mockResolvedValue({ id: 'p1', sessionId: 's1' }),
      assertCanOperateParticipant: jest.fn().mockResolvedValue(undefined),
      lockedSession: jest.fn().mockResolvedValue(endedSession()),
    };
    audit = { record: jest.fn() };
    service = new PerformanceEvaluationsService(
      {} as Repository<PerformanceEvaluationEntity>,
      access as unknown as TrainingAccessService,
      {} as TrainingOperationsFacade,
      {
        transaction: (work: (m: typeof manager) => Promise<unknown>) =>
          work(manager),
      } as unknown as DataSource,
      audit,
    );
  });

  it('changes score and comment, keeps the evaluator and logs before/after with the reason', async () => {
    const result = await service.update(actor, 'p1', {
      score: 8,
      comment: null,
      reason: 'Chấm nhầm',
    });

    expect(result).toMatchObject({
      score: 8,
      comment: null,
      evaluatorId: 'ht-9',
    });
    expect(audit.record).toHaveBeenCalledWith(manager, {
      actorId: 'ht-1',
      action: 'UPDATE',
      entityType: 'PERFORMANCE_EVALUATION',
      entityId: 'e1',
      before: { score: 6, comment: 'Ổn' },
      after: { score: 8, comment: null },
      reason: 'Chấm nhầm',
      feature: 'PERF_EVAL',
    });
  });

  it('writes nothing when no field changes', async () => {
    await service.update(actor, 'p1', { score: 6, reason: 'x' });

    expect(manager.save).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('rejects a caller who may not operate the participant (403)', async () => {
    access.assertCanOperateParticipant.mockRejectedValue(
      new ForbiddenException(
        'Lượt tập thuộc lớp của Huấn luyện viên trưởng khác',
      ),
    );

    await expect(
      service.update(actor, 'p1', { score: 8, reason: 'x' }),
    ).rejects.toThrow(ForbiddenException);
    expect(manager.findOne).not.toHaveBeenCalled();
  });

  it('returns 404 when the participant has no evaluation', async () => {
    manager.findOne.mockResolvedValue(null);

    await expect(
      service.update(actor, 'p1', { score: 8, reason: 'x' }),
    ).rejects.toThrow(new NotFoundException('Lượt tập chưa có đánh giá'));
  });

  it('returns 409 when the session is cancelled', async () => {
    access.lockedSession.mockResolvedValue(
      endedSession({ status: TrainingSessionStatus.CANCELLED }),
    );

    await expect(
      service.update(actor, 'p1', { score: 8, reason: 'x' }),
    ).rejects.toThrow(
      new ConflictException('Buổi tập đã hủy, không sửa kết quả được'),
    );
    expect(manager.save).not.toHaveBeenCalled();
  });

  it('returns 409 when more than 7 days passed since the scheduled end', async () => {
    access.lockedSession.mockResolvedValue(
      endedSession({
        scheduledEndAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000),
      }),
    );

    await expect(
      service.update(actor, 'p1', { score: 8, reason: 'x' }),
    ).rejects.toThrow(new ConflictException('Quá hạn sửa kết quả buổi tập'));
    expect(manager.save).not.toHaveBeenCalled();
  });
});

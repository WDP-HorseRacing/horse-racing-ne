import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import type { Actor } from '../../../common/types/actor';
import { AuditAction } from '../../audit/constants/audit-action.enum';
import { AuditEntityType } from '../../audit/constants/audit-entity-type.enum';
import { AuditFeature } from '../../audit/constants/audit-feature.enum';
import { AuditService } from '../../audit/services/audit.service';
import {
  CreatePerformanceEvaluationDto,
  PerformanceEvaluationResponseDto,
} from '../dto/performance-evaluation.dto';
import { PerformanceEvaluationEntity } from '../entities/performance-evaluation.entity';
import { toPerformanceEvaluationResponse } from '../mappers/performance-evaluation.mapper';
import { TrainingAccessService } from '../../training/shared/training-access.service';
import { TrainingOperationsFacade } from '../../training/shared/training-operations.facade';

@Injectable()
export class PerformanceEvaluationsService {
  constructor(
    @InjectRepository(PerformanceEvaluationEntity)
    private readonly evaluations: Repository<PerformanceEvaluationEntity>,
    private readonly access: TrainingAccessService,
    private readonly training: TrainingOperationsFacade,
    private readonly dataSource: DataSource,
    private readonly auditService: AuditService,
  ) {}

  async create(
    actor: Actor,
    participantId: string,
    body: CreatePerformanceEvaluationDto,
  ): Promise<PerformanceEvaluationResponseDto> {
    const row = await this.dataSource.transaction(async (manager) => {
      const caller = await this.access.currentUser(actor, manager);
      const participant = await this.access.findParticipant(
        manager,
        participantId,
      );
      await this.access.assertCanOperateParticipant(
        manager,
        actor,
        caller.id,
        participant,
      );
      await this.training.assertParticipantFinished(manager, participantId);
      const existing = await manager.findOneBy(PerformanceEvaluationEntity, {
        sessionParticipantId: participantId,
      });
      if (existing) throw new ConflictException('Lượt tập đã có đánh giá');
      const evaluation = await manager.save(
        manager.create(PerformanceEvaluationEntity, {
          sessionParticipantId: participantId,
          evaluatorId: caller.id,
          score: body.score,
          comment: body.comment ?? null,
        }),
      );
      await this.auditService.record(manager, {
        actorId: caller.id,
        action: AuditAction.CREATE,
        entityType: AuditEntityType.PERFORMANCE_EVALUATION,
        entityId: evaluation.id,
        before: null,
        after: {
          sessionParticipantId: participantId,
          score: evaluation.score,
          comment: evaluation.comment,
        },
        feature: AuditFeature.PERF_EVAL,
      });
      return evaluation;
    });
    return toPerformanceEvaluationResponse(row);
  }

  async get(
    actor: Actor,
    participantId: string,
  ): Promise<PerformanceEvaluationResponseDto> {
    const caller = await this.access.currentUser(actor);
    const participant = await this.access.findParticipant(
      this.dataSource.manager,
      participantId,
    );
    await this.access.readableHorseForActor(actor, participant.horseId);
    await this.access.assertTrainerBarn(
      this.dataSource.manager,
      actor,
      caller.id,
      participant.horseId,
    );
    const row = await this.evaluations.findOneBy({
      sessionParticipantId: participantId,
    });
    if (!row) throw new NotFoundException('Lượt tập chưa có đánh giá');
    return toPerformanceEvaluationResponse(row);
  }
}

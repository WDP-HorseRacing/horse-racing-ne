import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import type { Actor } from '../../../common/types/actor';
import { changedFieldsDiff } from '../../../common/utils/record-diff';
import { AuditAction } from '../../audit/constants/audit-action.enum';
import { AuditEntityType } from '../../audit/constants/audit-entity-type.enum';
import { AuditFeature } from '../../audit/constants/audit-feature.enum';
import { AuditService } from '../../audit/services/audit.service';
import {
  CreatePerformanceEvaluationDto,
  PerformanceEvaluationResponseDto,
  UpdatePerformanceEvaluationDto,
} from '../dto/performance-evaluation.dto';
import { PerformanceEvaluationEntity } from '../entities/performance-evaluation.entity';
import { toPerformanceEvaluationResponse } from '../mappers/performance-evaluation.mapper';
import { assertSessionRecordEditable } from '../../training/policies/training.policy';
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

  /**
   * Sửa điểm hoặc nhận xét của đánh giá một lượt tập
   *
   * - Quyền như khi tạo đánh giá: Head Trainer phụ trách lớp, ngựa thuộc khu mình
   * - Field bỏ trống giữ nguyên; comment null là xóa nhận xét; không đổi người đánh giá
   * - Buổi đã hủy: 409; không giới hạn thời gian sau khi buổi kết thúc
   * - Có field đổi khác: ghi một dòng nhật ký gồm giá trị trước, sau của các field đổi và lý do; không đổi gì thì không ghi
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param participantId UUID của lượt tham gia buổi tập
   * @param body Điểm, nhận xét mới và lý do sửa
   * @returns Promise trả về đánh giá sau khi sửa
   * @throws ForbiddenException Nếu tài khoản không hoạt động hoặc người gọi không được thao tác lượt tập này
   * @throws NotFoundException Nếu không có lượt tập hoặc lượt tập chưa có đánh giá
   * @throws ConflictException Nếu buổi đã hủy
   */
  async update(
    actor: Actor,
    participantId: string,
    body: UpdatePerformanceEvaluationDto,
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
      const session = await this.access.lockedSession(
        manager,
        participant.sessionId,
      );
      const evaluation = await manager.findOne(PerformanceEvaluationEntity, {
        where: { sessionParticipantId: participantId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!evaluation) throw new NotFoundException('Lượt tập chưa có đánh giá');
      assertSessionRecordEditable(session.status);
      const diff = changedFieldsDiff(
        { score: evaluation.score, comment: evaluation.comment },
        { score: body.score, comment: body.comment },
      );
      if (!diff) return evaluation;
      if (diff.after.score !== undefined) evaluation.score = diff.after.score;
      if (diff.after.comment !== undefined) {
        evaluation.comment = diff.after.comment;
      }
      const saved = await manager.save(evaluation);
      await this.auditService.record(manager, {
        actorId: caller.id,
        action: AuditAction.UPDATE,
        entityType: AuditEntityType.PERFORMANCE_EVALUATION,
        entityId: saved.id,
        ...diff,
        reason: body.reason,
        feature: AuditFeature.PERF_EVAL,
      });
      return saved;
    });
    return toPerformanceEvaluationResponse(row);
  }
}

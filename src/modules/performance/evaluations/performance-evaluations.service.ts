import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import type { Actor } from '../../../common/types/actor';
import { changedFieldsDiff } from '../../../common/utils/record-diff';
import { mapUniqueViolation } from '../../../common/utils/unique-violation';
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

/**
 * Thông báo 409 khi lượt tập đã có đánh giá.
 */
const EVALUATION_EXISTS_MESSAGE = 'Lượt tập đã có đánh giá';

/**
 * Thông báo 409 cho unique index mà việc tạo đánh giá có thể vi phạm khi hai thao tác chạy cùng lúc.
 */
const EVALUATION_CONFLICT_MESSAGES: Record<string, string> = {
  performance_evaluations_participant_uq: EVALUATION_EXISTS_MESSAGE,
};

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
      await this.access.assertCanRecordRunResult(
        manager,
        actor,
        caller.id,
        participant,
      );
      await this.training.assertParticipantFinished(manager, participantId);
      const existing = await manager.findOneBy(PerformanceEvaluationEntity, {
        sessionParticipantId: participantId,
      });
      if (existing) throw new ConflictException(EVALUATION_EXISTS_MESSAGE);
      const evaluation = await mapUniqueViolation(
        () =>
          manager.save(
            manager.create(PerformanceEvaluationEntity, {
              sessionParticipantId: participantId,
              evaluatorId: caller.id,
              score: body.score,
              comment: body.comment ?? null,
            }),
          ),
        EVALUATION_CONFLICT_MESSAGES,
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

  /**
   * Xem đánh giá của một lượt tập
   *
   * - Quyền xem theo TrainingAccessService.assertCanReadParticipant
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param participantId UUID của lượt tham gia buổi tập
   * @returns Promise trả về đánh giá của lượt
   * @throws ForbiddenException Nếu tài khoản không tồn tại hoặc không hoạt động
   * @throws NotFoundException Nếu không có lượt tập, người gọi không được xem lượt này hoặc lượt chưa có đánh giá
   */
  async get(
    actor: Actor,
    participantId: string,
  ): Promise<PerformanceEvaluationResponseDto> {
    await this.access.assertCanReadParticipant(
      actor,
      participantId,
      this.dataSource.manager,
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
   * - Quyền theo TrainingAccessService.assertCanRecordRunResult: Head Trainer phụ trách lớp; ngựa đã sang khu khác vẫn sửa được, ngựa đã chuyển nhượng hoặc đã mất thì 409
   * - Field bỏ trống giữ nguyên; comment null là xóa nhận xét; không đổi người đánh giá
   * - Buổi đã hủy: 409; không giới hạn thời gian sau khi buổi kết thúc
   * - Có field đổi khác: ghi một dòng nhật ký gồm giá trị trước, sau của các field đổi và lý do; không đổi gì thì không ghi
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param participantId UUID của lượt tham gia buổi tập
   * @param body Điểm, nhận xét mới và lý do sửa
   * @returns Promise trả về đánh giá sau khi sửa
   * @throws ForbiddenException Nếu tài khoản không hoạt động hoặc người gọi không được thao tác lượt tập này
   * @throws NotFoundException Nếu không có lượt tập, hồ sơ ngựa đã xóa hoặc lượt tập chưa có đánh giá
   * @throws ConflictException Nếu ngựa đã chuyển nhượng hoặc đã mất, hoặc buổi đã hủy
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
      await this.access.assertCanRecordRunResult(
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
        lock: { mode: 'for_no_key_update' },
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

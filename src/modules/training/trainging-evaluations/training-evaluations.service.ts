import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import type { Actor } from '../../../common/types/actor';
import { PerformanceEvaluationEntity } from '../../performance/entities/performance-evaluation.entity';
import { TrainingSessionStatus } from '../enums/training-session-status.enum';
import {
  EvaluateSessionDto,
  SessionEvaluationResponseDto,
} from '../dto/training-session.dto';
import { toEvaluationResponse } from '../mappers/training.mapper';
import { TrainingAccessService } from '../shared/training-access.service';

@Injectable()
export class EvaluationsService {
  constructor(
    @InjectRepository(PerformanceEvaluationEntity)
    private readonly evaluations: Repository<PerformanceEvaluationEntity>,
    private readonly access: TrainingAccessService,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Tạo đánh giá hiệu suất cho buổi tập sau khi hoàn thành (COMPLETED).
   * Mỗi buổi tập chỉ được có tối đa một bản ghi đánh giá.
   */
  async create(
    actor: Actor,
    sessionId: string,
    body: EvaluateSessionDto,
  ): Promise<SessionEvaluationResponseDto> {
    const caller = await this.access.currentUser(actor);
    const row = await this.dataSource.transaction(async (manager) => {
      const session = await this.access.lockedSession(manager, sessionId);
      await this.access.assertCanOperateSession(
        manager,
        actor,
        caller.id,
        session,
      );
      if (session.status !== TrainingSessionStatus.COMPLETED) {
        throw new ConflictException('Chỉ đánh giá buổi tập đã COMPLETED');
      }
      if (await manager.findOneBy(PerformanceEvaluationEntity, { sessionId })) {
        throw new ConflictException('Buổi tập đã có đánh giá');
      }
      return manager.save(
        manager.create(PerformanceEvaluationEntity, {
          sessionId,
          evaluatorId: caller.id,
          score: body.score,
          comment: body.comment ?? null,
        }),
      );
    });
    return toEvaluationResponse(row);
  }

  /**
   * Lấy thông tin đánh giá hiệu suất của một buổi tập theo sessionId
   * sau khi xác nhận quyền hạn và phạm vi chuồng phụ trách của trainer.
   */
  async get(
    actor: Actor,
    sessionId: string,
  ): Promise<SessionEvaluationResponseDto> {
    const caller = await this.access.currentUser(actor);
    const session = await this.access.sessionForActor(actor, sessionId);
    await this.access.assertTrainerBarn(
      this.dataSource.manager,
      actor,
      caller.id,
      session.plan.horseId,
    );
    const row = await this.evaluations.findOneBy({ sessionId });
    if (!row) throw new NotFoundException('Buổi tập chưa có đánh giá');
    return toEvaluationResponse(row);
  }
}

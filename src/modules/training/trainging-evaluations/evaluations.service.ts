import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { Actor } from '../../../common/types/actor';
import { PerformanceEvaluationEntity } from '../../performance/entities/performance-evaluation.entity';
import { TrainingSessionStatus } from '../constants/training-session-status.enum';
import {
  EvaluateSessionDto,
  SessionEvaluationResponseDto,
} from '../dto/training-session.dto';
import { toEvaluationResponse } from '../mappers/training.mapper';
import { TrainingAccessService } from '../shared/training-access.service';
import { EvaluationsRepository } from './evaluations.repository';

@Injectable()
export class EvaluationsService {
  constructor(
    private readonly evaluations: EvaluationsRepository,
    private readonly access: TrainingAccessService,
    private readonly dataSource: DataSource,
  ) {}

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
   * Lấy đánh giá của một buổi tập, khi người gọi được xem con ngựa của buổi tập đó.
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param sessionId UUID của buổi tập
   * @returns Đánh giá của buổi tập
   * @throws NotFoundException Nếu không có buổi tập hoặc chưa có đánh giá, hoặc ngựa nằm ngoài phạm vi của người gọi
   * @throws ForbiddenException Nếu người gọi là Head Trainer mà ngựa không thuộc khu mình phụ trách
   */
  async get(
    actor: Actor,
    sessionId: string,
  ): Promise<SessionEvaluationResponseDto> {
    const caller = await this.access.currentUser(actor);
    const session = await this.access.sessionForActor(actor, sessionId);
    await this.access.readableHorseForActor(actor, session.plan.horseId);
    await this.access.assertTrainerBarn(
      this.dataSource.manager,
      actor,
      caller.id,
      session.plan.horseId,
    );
    const row = await this.evaluations.findBySession(sessionId);
    if (!row) throw new NotFoundException('Buổi tập chưa có đánh giá');
    return toEvaluationResponse(row);
  }
}

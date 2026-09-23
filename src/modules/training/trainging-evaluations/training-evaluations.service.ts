import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import type { Actor } from '../../../common/types/actor';
import { PerformanceEvaluationEntity } from '../entities/performance-evaluation.entity';
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
    const row = await this.evaluations.findOneBy({ sessionId });
    if (!row) throw new NotFoundException('Buổi tập chưa có đánh giá');
    return toEvaluationResponse(row);
  }

  /**
   * Lấy đánh giá mới nhất của một con ngựa, dành cho module performance đọc (bảng performance_evaluations thuộc training)
   *
   * - Không kiểm quyền: nơi gọi phải tự kiểm quyền xem con ngựa trước
   * - Trả tối đa một bản ghi, kèm buổi tập và giáo án của nó
   *
   * @param horseId UUID của ngựa
   * @returns A promise resolving to mảng rỗng hoặc một đánh giá mới nhất
   */
  listLatestByHorse(horseId: string): Promise<PerformanceEvaluationEntity[]> {
    return this.evaluations.find({
      where: { session: { plan: { horseId } } },
      relations: { session: { plan: true } },
      order: { createdAt: 'DESC' },
      take: 1,
    });
  }
}

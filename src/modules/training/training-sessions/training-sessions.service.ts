import { ConflictException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { DomainEventPublisher } from '../../../common/infrastructure/events/domain-event.publisher';
import type { Actor } from '../../../common/types/actor';
import { TrainingLockEntity } from '../../medical/entities/training-lock.entity';
import { TrainingPlanStatus } from '../enums/training-plan-status.enum';
import { TrainingSessionStatus } from '../enums/training-session-status.enum';
import {
  CancelTrainingSessionDto,
  CompleteTrainingSessionDto,
  CreateTrainingSessionDto,
  TrainingSessionResponseDto,
  UpdateTrainingSessionDto,
} from '../dto/training-session.dto';
import { TrainingPlanEntity } from '../entities/training-plan.entity';
import { TrainingSessionEntity } from '../entities/training-session.entity';
import { toTrainingSessionResponse } from '../mappers/training.mapper';
import {
  assertSessionAbleToStart,
  assertSessionCancellable,
  assertSessionCompletable,
  assertSessionDateInPlan,
  assertSessionEditable,
} from '../policies/training.policy';
import { TrainingAccessService } from '../shared/training-access.service';
import {
  HorseHealthStatus,
  HorseLifecycleStatus,
} from '../../horses/enums/horse-status.enum';
import { TrainingLockStatus } from '../../medical/constants/training-lock.enum';

@Injectable()
export class TrainingSessionsService {
  constructor(
    @InjectRepository(TrainingSessionEntity)
    private readonly sessionsRepo: Repository<TrainingSessionEntity>,
    private readonly accessService: TrainingAccessService,
    private readonly dataSource: DataSource,
    private readonly events: DomainEventPublisher,
  ) {}

  /**
   * Lấy danh sách buổi tập của một giáo án, khi người gọi được xem con ngựa của giáo án đó.
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param planId UUID của giáo án
   * @returns Danh sách buổi tập của giáo án
   * @throws NotFoundException Nếu không có giáo án, hoặc ngựa của giáo án nằm ngoài phạm vi của người gọi
   */
  async listSessions(
    actor: Actor,
    planId: string,
  ): Promise<TrainingSessionResponseDto[]> {
    const plan = await this.accessService.planForActor(actor, planId);
    await this.accessService.readableHorseForActor(actor, plan.horseId);
    return (
      await this.sessionsRepo.find({
        where: { planId },
        order: { scheduledAt: 'ASC' },
      })
    ).map(toTrainingSessionResponse);
  }

  /**
   * Lấy một buổi tập, khi người gọi được xem con ngựa của buổi tập đó.
   *
   * @param actor Thông tin danh tính từ Access Token
   * @param sessionId UUID của buổi tập
   * @returns Buổi tập
   * @throws NotFoundException Nếu không có buổi tập, hoặc ngựa của buổi tập nằm ngoài phạm vi của người gọi
   */
  async getSessionById(
    actor: Actor,
    sessionId: string,
  ): Promise<TrainingSessionResponseDto> {
    const session = await this.accessService.sessionForActor(actor, sessionId);
    await this.accessService.readableHorseForActor(actor, session.plan.horseId);
    return toTrainingSessionResponse(session);
  }

  /**
   * Tạo mới một buổi tập (SCHEDULED) trong giáo án đang SCHEDULED hoặc ACTIVE;
   * kiểm tra thời gian nằm trong khoảng ngày giáo án và xác thực groom (nếu có).
   */
  async createSession(
    actor: Actor,
    planId: string,
    body: CreateTrainingSessionDto,
  ): Promise<TrainingSessionResponseDto> {
    const caller = await this.accessService.currentUser(actor);
    const row = await this.dataSource.transaction(async (manager) => {
      const plan = await this.accessService.lockedPlan(manager, planId);
      // kiểm tra trainer quản lý barn hay không
      await this.accessService.assertTrainerBarn(
        manager,
        actor,
        caller.id,
        plan.horseId,
      );
      // kiểm tra plan phải là SCHEDULED hoặc ACTIVE
      if (
        plan.status !== TrainingPlanStatus.SCHEDULED &&
        plan.status !== TrainingPlanStatus.ACTIVE
      ) {
        throw new ConflictException(
          'Không thể thêm buổi tập vào giáo án đã kết thúc',
        );
      }
      // kiểm tra thời gian tạo phải nằm trong khoảng ngày giáo án
      assertSessionDateInPlan(body.scheduledAt, plan.startDate, plan.endDate);
      // kiểm tra phần của user có phải là Groom
      if (body.groomId)
        await this.accessService.assertGroom(manager, body.groomId);
      return manager.save(
        manager.create(TrainingSessionEntity, {
          planId,
          scheduledAt: new Date(body.scheduledAt),
          distanceKm: body.distanceKm,
          plannedDurationMinutes: body.plannedDurationMinutes ?? null,
          intensity: body.intensity,
          surface: body.surface ?? null,
          groomId: body.groomId ?? null,
          status: TrainingSessionStatus.SCHEDULED,
        }),
      );
    });
    return toTrainingSessionResponse(row);
  }

  /**
   * Cập nhật thông tin buổi tập (chỉ khi SCHEDULED). Kiểm tra thời gian mới
   * nằm trong khoảng ngày của giáo án và xác thực groom (nếu đổi).
   */
  async updateSession(
    actor: Actor,
    sessionId: string,
    body: UpdateTrainingSessionDto,
  ): Promise<TrainingSessionResponseDto> {
    const caller = await this.accessService.currentUser(actor);
    const session = await this.dataSource.transaction(async (manager) => {
      const curSession = await this.accessService.lockedSession(
        manager,
        sessionId,
      );
      // kiểm tra session phải là SCHEDULED
      assertSessionEditable(curSession.status);
      const plan = await manager.findOneByOrFail(TrainingPlanEntity, {
        id: curSession.planId,
      });
      // kiểm tra trainer quản lý barn hay không
      await this.accessService.assertTrainerBarn(
        manager,
        actor,
        caller.id,
        plan.horseId,
      );
      const updates: Partial<TrainingSessionEntity> = {
        distanceKm: body.distanceKm ?? curSession.distanceKm,
        plannedDurationMinutes:
          body.plannedDurationMinutes ?? curSession.plannedDurationMinutes,
        intensity: body.intensity ?? curSession.intensity,
        surface: body.surface ?? curSession.surface,
      };

      if (body.scheduledAt !== undefined) {
        assertSessionDateInPlan(body.scheduledAt, plan.startDate, plan.endDate);
        updates.scheduledAt = new Date(body.scheduledAt);
      }
      if (body.groomId) {
        await this.accessService.assertGroom(manager, body.groomId);
        updates.groomId = body.groomId;
      }
      Object.assign(curSession, updates);
      return manager.save(curSession);
    });
    return toTrainingSessionResponse(session);
  }

  /**
   * Bắt đầu buổi tập (chuyển sang IN_PROGRESS). Yêu cầu giáo án đang ACTIVE,
   * ngựa đủ điều kiện sức khỏe, không bị khóa y tế và không có buổi tập khác đang chạy.
   */
  async startSession(
    actor: Actor,
    sessionId: string,
  ): Promise<TrainingSessionResponseDto> {
    const caller = await this.accessService.currentUser(actor);
    const session = await this.dataSource.transaction(async (manager) => {
      const snapshot = await this.accessService.findSession(
        manager,
        sessionId,
      );
      const horse = await this.accessService.lockedHorse(
        manager,
        snapshot.plan.horseId,
      );
      const current = await this.accessService.lockedSession(
        manager,
        sessionId,
      );
      if (current.planId !== snapshot.planId) {
        throw new ConflictException(
          'Buổi tập đã được thay đổi, vui lòng thử lại',
        );
      }
      // kiểm tra phân quyền user
      await this.accessService.assertCanOperateSession(
        manager,
        actor,
        caller.id,
        current,
      );
      // kiểm tra trạng thái session phải là SCHEDULED
      assertSessionAbleToStart(current.status);
      const plan = await manager.findOneByOrFail(TrainingPlanEntity, {
        id: current.planId,
      });
      // kiểm tra giáo án phải là ACTIVE
      if (plan.status !== TrainingPlanStatus.ACTIVE)
        throw new ConflictException('Giáo án chưa ACTIVE');
      if (plan.horseId !== horse.id) {
        throw new ConflictException(
          'Giáo án đã được chuyển sang ngựa khác, vui lòng thử lại',
        );
      }
      // kiểm tra ngựa phải ở trạng thái ACTIVE và healthStatus là ELIGIBLE
      if (
        horse.lifecycleStatus !== HorseLifecycleStatus.ACTIVE ||
        horse.healthStatus !== HorseHealthStatus.ELIGIBLE
      )
        throw new ConflictException('Ngựa không đủ điều kiện để tập luyện');
      const activeLock = await manager.findOneBy(TrainingLockEntity, {
        horseId: horse.id,
        status: TrainingLockStatus.ACTIVE,
      });
      if (activeLock)
        throw new ConflictException('Ngựa đang bị khóa huấn luyện');
      const running = await manager
        .createQueryBuilder(TrainingSessionEntity, 'session')
        .innerJoin(TrainingPlanEntity, 'plan', 'plan.id = session.plan_id')
        .where('plan.horse_id = :horseId', { horseId: horse.id })
        .andWhere('session.status = :status', {
          status: TrainingSessionStatus.IN_PROGRESS,
        })
        .andWhere('session.id <> :id', { id: sessionId })
        .getCount();
      if (running)
        throw new ConflictException('Ngựa đang có buổi tập khác diễn ra');
      current.status = TrainingSessionStatus.IN_PROGRESS;
      current.startedAt = new Date();
      return manager.save(current);
    });
    // public event
    // this.events.publish('training.session.started', {
    //   sessionId: session.id,
    //   planId: session.planId,
    // });
    return toTrainingSessionResponse(session);
  }

  /**
   * Hoàn thành buổi tập (COMPLETED), ghi nhận cự ly thực tế, thời lượng, mức độ gắng sức và ghi chú.
   */
  async completeSession(
    actor: Actor,
    sessionId: string,
    body: CompleteTrainingSessionDto,
  ): Promise<TrainingSessionResponseDto> {
    const caller = await this.accessService.currentUser(actor);
    const session = await this.dataSource.transaction(async (manager) => {
      const current = await this.accessService.lockedSession(
        manager,
        sessionId,
      );
      await this.accessService.assertCanOperateSession(
        manager,
        actor,
        caller.id,
        current,
      );
      assertSessionCompletable(current.status);
      current.status = TrainingSessionStatus.COMPLETED;
      current.completedAt = new Date();
      current.actualDistanceKm =
        body.actualDistanceKm === undefined
          ? null
          : String(body.actualDistanceKm);
      current.actualDurationSeconds = body.actualDurationSeconds ?? null;
      current.perceivedEffort = body.perceivedEffort ?? null;
      current.completionNotes = body.notes ?? null;
      return manager.save(current);
    });
    // public event
    // this.events.publish('training.session.completed', {
    //   sessionId: session.id,
    //   planId: session.planId,
    // });
    return toTrainingSessionResponse(session);
  }

  /**
   * Hủy buổi tập (CANCELLED) kèm lý do hủy. Chỉ cho phép hủy buổi tập chưa kết thúc.
   */
  async cancelSession(
    actor: Actor,
    sessionId: string,
    body: CancelTrainingSessionDto,
  ): Promise<TrainingSessionResponseDto> {
    const caller = await this.accessService.currentUser(actor);
    const session = await this.dataSource.transaction(async (manager) => {
      const current = await this.accessService.lockedSession(
        manager,
        sessionId,
      );
      await this.accessService.assertCanOperateSession(
        manager,
        actor,
        caller.id,
        current,
      );
      assertSessionCancellable(current.status);
      current.status = TrainingSessionStatus.CANCELLED;
      current.cancelledAt = new Date();
      current.cancelledBy = caller.id;
      current.cancelReason = body.reason;
      return manager.save(current);
    });
    // public event
    // this.events.publish('training.session.cancelled', {
    //   sessionId: session.id,
    //   planId: session.planId,
    //   reason: body.reason,
    // });
    return toTrainingSessionResponse(session);
  }
}

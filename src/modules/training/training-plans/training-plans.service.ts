import { ConflictException, Injectable } from '@nestjs/common';
import { DataSource, EntityManager, In } from 'typeorm';
import { DomainEventPublisher } from '../../../common/infrastructure/events/domain-event.publisher';
import type { Actor } from '../../../common/types/actor';
import { TrainingPlanStatus } from '../constants/training-plan-status.enum';
import { TrainingSessionStatus } from '../constants/training-session-status.enum';
import {
  CancelTrainingPlanDto,
  CreateTrainingPlanDto,
  TrainingPlanResponseDto,
  UpdateTrainingPlanDto,
} from '../dto/training-plan.dto';
import { TrainingPlanEntity } from '../entities/training-plan.entity';
import { TrainingSessionEntity } from '../entities/training-session.entity';
import { toTrainingPlanResponse } from '../mappers/training.mapper';
import {
  assertPlanActivatable,
  assertPlanCancellable,
  assertPlanCompletable,
  assertPlanEditable,
  assertValidPlanDates,
  dateOnly,
} from '../policies/training.policy';
import { TrainingAccessService } from '../shared/training-access.service';
import { TrainingPlansRepository } from './training-plans.repository';

@Injectable()
export class TrainingPlansService {
  constructor(
    private readonly planRepo: TrainingPlansRepository,
    private readonly access: TrainingAccessService,
    private readonly dataSource: DataSource,
    private readonly events: DomainEventPublisher,
  ) {}

  async listPlansByHorse(
    actor: Actor,
    horseId: string,
  ): Promise<TrainingPlanResponseDto[]> {
    await this.access.horseForActor(actor, horseId);
    return (await this.planRepo.listByHorse(horseId)).map((plan) =>
      toTrainingPlanResponse(plan),
    );
  }

  async getPlanById(
    actor: Actor,
    id: string,
  ): Promise<TrainingPlanResponseDto> {
    return toTrainingPlanResponse(await this.access.planForActor(actor, id));
  }

  async createTrainingPlan(
    actor: Actor,
    horseId: string,
    body: CreateTrainingPlanDto,
  ): Promise<TrainingPlanResponseDto> {
    const { user, horse } = await this.access.horseForActor(actor, horseId);
    return toTrainingPlanResponse(
      await this.planRepo.save({
        horseId: horse.id,
        createdBy: user.id,
        phaseName: body.phaseName,
        goal: body.goal,
        startDate: dateOnly(body.startDate),
        endDate: dateOnly(body.endDate),
        status: TrainingPlanStatus.SCHEDULED,
      }),
    );
  }

  async updatePlan(
    actor: Actor,
    planId: string,
    updateDto: UpdateTrainingPlanDto,
  ): Promise<TrainingPlanResponseDto> {
    const clubId = await this.access.clubId(actor);
    const updated = await this.dataSource.transaction(async (manager) => {
      const plan = await this.access.lockedPlanInClub(manager, planId, clubId);
      assertPlanEditable(plan.status); // kiểm tra: plan phải có status SCHEDULED
      const startDate = updateDto.startDate
        ? dateOnly(updateDto.startDate)
        : plan.startDate;
      const endDate = updateDto.endDate
        ? dateOnly(updateDto.endDate)
        : plan.endDate;
      assertValidPlanDates(startDate, endDate); // kiểm tra lại: endDate > startDate
      // đảm bảo không có session nào nằm ngoài (startDate và endDate) mới
      const outside = await manager
        .createQueryBuilder(TrainingSessionEntity, 'session')
        .where('session.plan_id = :planId', { planId: planId })
        .andWhere(
          '(session.scheduled_at::date < :startDate OR session.scheduled_at::date > :endDate)',
          { startDate, endDate },
        )
        .getCount();
      if (outside) {
        throw new ConflictException(
          'Khoảng ngày mới không bao phủ tất cả buổi tập đã lên lịch',
        );
      }
      plan.phaseName = updateDto.phaseName ?? plan.phaseName;
      plan.goal = updateDto.goal ?? plan.goal;
      plan.startDate = startDate;
      plan.endDate = endDate;
      return manager.save(plan);
    });
    return toTrainingPlanResponse(updated);
  }

  async activatePlan(
    actor: Actor,
    planId: string,
  ): Promise<TrainingPlanResponseDto> {
    const clubId = await this.access.clubId(actor);
    const updatedPlan = await this.dataSource.transaction(async (manager) => {
      // khóa training plan
      const curPlan = await this.access.lockedPlanInClub(
        manager,
        planId,
        clubId,
      );
      assertPlanActivatable(curPlan.status); // kiểm tra: plan phải có status SCHEDULED
      // khóa horse ứng với training plan
      await this.access.lockedHorseInClub(manager, curPlan.horseId, clubId);
      // kiểm tra: plan phải có ít nhất một session
      const sessionCount = await manager.countBy(TrainingSessionEntity, {
        planId: planId,
      });
      if (sessionCount === 0) {
        throw new ConflictException('Giáo án phải có ít nhất một buổi tập');
      }
      // kiểm tra: horse không được có giáo án ACTIVE nào khác
      const planCount = await manager.countBy(TrainingPlanEntity, {
        horseId: curPlan.horseId,
        status: TrainingPlanStatus.ACTIVE,
      });
      if (planCount > 0) {
        throw new ConflictException('Ngựa đang có một giáo án ACTIVE khác');
      }

      curPlan.status = TrainingPlanStatus.ACTIVE;
      curPlan.activatedAt = new Date();
      return manager.save(curPlan);
    });
    // publish event: training-plan to activated
    this.events.publish('training.plan.activated', {
      planId: updatedPlan.id,
      horseId: updatedPlan.horseId,
    });
    return toTrainingPlanResponse(updatedPlan);
  }

  async cancelPlan(
    actor: Actor,
    planId: string,
    body: CancelTrainingPlanDto,
  ): Promise<TrainingPlanResponseDto> {
    const caller = await this.access.currentUser(actor);
    const now = new Date();
    const plan = await this.dataSource.transaction(async (manager) => {
      // lock training-plan
      const current = await this.access.lockedPlanInClub(
        manager,
        planId,
        caller.clubId,
      );
      assertPlanCancellable(current.status);
      const running = await manager.countBy(TrainingSessionEntity, {
        planId: planId,
        status: TrainingSessionStatus.IN_PROGRESS,
      });
      if (running > 0) {
        throw new ConflictException(
          'Phải kết thúc hoặc hủy buổi tập đang chạy trước',
        );
      }
      // 1. Hủy dây chuyền (Cascade Cancel): Tự động hủy tất cả các buổi tập con chưa hoàn thành thuộc giáo án này
      await manager.update(
        TrainingSessionEntity,
        {
          planId: planId,
          status: In([
            TrainingSessionStatus.SCHEDULED,
            TrainingSessionStatus.IN_PROGRESS,
          ]),
        },
        {
          status: TrainingSessionStatus.CANCELLED,
          cancelledAt: now,
          cancelledBy: caller.id,
          cancelReason: `Giáo án bị hủy: ${body.reason}`,
        },
      );
      // 2. Cập nhật trạng thái hủy (CANCELLED) cho chính bản thân giáo án cha
      current.status = TrainingPlanStatus.CANCELLED;
      current.cancelledAt = now;
      current.cancelReason = body.reason;
      return manager.save(current);
    });
    // publish event: training-plan-cancelled
    this.events.publish('training.plan.cancelled', {
      planId: plan.id,
      horseId: plan.horseId,
      reason: body.reason,
    });
    return toTrainingPlanResponse(plan);
  }

  async completePlan(
    actor: Actor,
    planId: string,
  ): Promise<TrainingPlanResponseDto> {
    const clubId = await this.access.clubId(actor);
    const plan = await this.dataSource.transaction(async (manager) => {
      const current = await this.access.lockedPlanInClub(
        manager,
        planId,
        clubId,
      );
      assertPlanCompletable(current.status); // kiểm tra: status của Plan phải là ACTIVE
      await this.assertCanComplete(manager, planId); // kiểm tra: Plan phải có ít nhất một buổi tập và không có buổi tập IN_PROGRESS nào
      current.status = TrainingPlanStatus.COMPLETED;
      current.completedAt = new Date();
      return manager.save(current);
    });
    // publish event
    this.events.publish('training.plan.completed', {
      planId: plan.id,
      horseId: plan.horseId,
    });
    return toTrainingPlanResponse(plan);
  }

  private async assertCanComplete(
    manager: EntityManager,
    planId: string,
  ): Promise<void> {
    const sessions = await manager.find(TrainingSessionEntity, {
      where: { planId },
      select: { status: true },
    });
    // kiểm tra: giáo án vẫn còn buổi tập IN_PROGRESS
    const hasOpen = sessions.some(
      (s) => s.status === TrainingSessionStatus.IN_PROGRESS,
    );
    if (hasOpen) {
      throw new ConflictException('Giáo án vẫn còn buổi tập chưa kết thúc');
    }
    // kiểm tra: giáo án cần ít nhất một buổi tập COMPLETED
    const hasCompleted = sessions.some(
      (s) => s.status === TrainingSessionStatus.COMPLETED,
    );
    if (!hasCompleted) {
      throw new ConflictException('Giáo án cần ít nhất một buổi tập COMPLETED');
    }
  }
}

import { ConflictException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import type { Actor } from '../../../common/types/actor';
import {
  CancelTrainingPlanDto,
  CreateTrainingPlanDto,
  TrainingPlanResponseDto,
  UpdateTrainingPlanDto,
} from '../dto/training-plan.dto';
import { SessionParticipantStatus } from '../enums/session-participant-status.enum';
import { TrainingClassStatus } from '../enums/training-class-status.enum';
import { TrainingPlanStatus } from '../enums/training-plan-status.enum';
import { TrainingSessionStatus } from '../enums/training-session-status.enum';
import { SessionParticipantEntity } from '../entities/session-participant.entity';
import { TrainingPlanEntity } from '../entities/training-plan.entity';
import { TrainingSessionEntity } from '../entities/training-session.entity';
import {
  toTrainingPlanResponse,
  toTrainingPlanView,
} from '../mappers/training-plan.mapper';
import {
  assertPlanActivatable,
  assertPlanCancellable,
  assertPlanCompletable,
  assertPlanEditable,
  assertValidDateRange,
  dateOnly,
} from '../policies/training.policy';
import { TrainingAccessService } from '../shared/training-access.service';

@Injectable()
export class TrainingPlansService {
  constructor(
    @InjectRepository(TrainingPlanEntity)
    private readonly plans: Repository<TrainingPlanEntity>,
    private readonly access: TrainingAccessService,
    private readonly dataSource: DataSource,
  ) {}

  async listPlansByClass(
    actor: Actor,
    classId: string,
  ): Promise<TrainingPlanResponseDto[]> {
    await this.access.assertCanReadClass(actor, classId);
    const rows = await this.plans.find({
      where: { classId },
      order: { startDate: 'DESC', createdAt: 'DESC' },
    });
    return rows.map((row) =>
      toTrainingPlanView(row, this.access.seesPlanGoal(actor)),
    );
  }

  async createTrainingPlan(
    actor: Actor,
    classId: string,
    body: CreateTrainingPlanDto,
  ): Promise<TrainingPlanResponseDto> {
    const saved = await this.dataSource.transaction(async (manager) => {
      const caller = await this.access.currentUser(actor, manager);
      const trainingClass = await this.access.lockedTrainingClass(
        manager,
        classId,
      );
      this.access.assertCanManageClass(
        actor,
        caller.id,
        trainingClass.headTrainerId,
      );
      if (body.classId && body.classId !== classId) {
        throw new ConflictException('classId trong body không khớp route');
      }
      if (trainingClass.status !== TrainingClassStatus.ACTIVE) {
        throw new ConflictException('Chỉ class ACTIVE mới tạo plan');
      }
      const startDate = dateOnly(body.startDate);
      const endDate = dateOnly(body.endDate);
      assertValidDateRange(startDate, endDate);
      if (
        startDate < trainingClass.startDate ||
        endDate > trainingClass.endDate
      ) {
        throw new ConflictException('Plan phải nằm trong thời gian class');
      }
      return manager.save(
        manager.create(TrainingPlanEntity, {
          classId,
          name: body.name,
          createdBy: caller.id,
          phaseName: body.phaseName,
          goal: body.goal,
          startDate,
          endDate,
          status: TrainingPlanStatus.SCHEDULED,
        }),
      );
    });
    return toTrainingPlanResponse(saved);
  }

  async getPlanById(
    actor: Actor,
    id: string,
  ): Promise<TrainingPlanResponseDto> {
    const plan = await this.access.planForActor(actor, id);
    return toTrainingPlanView(plan, this.access.seesPlanGoal(actor));
  }

  async updatePlan(
    actor: Actor,
    planId: string,
    body: UpdateTrainingPlanDto,
  ): Promise<TrainingPlanResponseDto> {
    const saved = await this.dataSource.transaction(async (manager) => {
      const caller = await this.access.currentUser(actor, manager);
      const plan = await this.access.lockedPlan(manager, planId);
      this.access.assertCanManageClass(
        actor,
        caller.id,
        plan.trainingClass.headTrainerId,
      );
      assertPlanEditable(plan.status);
      if (body.classId && body.classId !== plan.classId) {
        throw new ConflictException('Không được đổi class của plan');
      }
      const startDate = body.startDate
        ? dateOnly(body.startDate)
        : plan.startDate;
      const endDate = body.endDate ? dateOnly(body.endDate) : plan.endDate;
      assertValidDateRange(startDate, endDate);
      if (
        startDate < plan.trainingClass.startDate ||
        endDate > plan.trainingClass.endDate
      ) {
        throw new ConflictException('Plan phải nằm trong thời gian class');
      }
      const outside = await manager
        .getRepository(TrainingSessionEntity)
        .createQueryBuilder('session')
        .where('session.plan_id = :planId', { planId })
        .andWhere(
          '(session.scheduled_start_at::date < :startDate OR session.scheduled_end_at::date > :endDate)',
          { startDate, endDate },
        )
        .getCount();
      if (outside)
        throw new ConflictException('Khoảng ngày mới không bao phủ session');
      Object.assign(plan, {
        name: body.name ?? plan.name,
        phaseName: body.phaseName ?? plan.phaseName,
        goal: body.goal ?? plan.goal,
        startDate,
        endDate,
      });
      return manager.save(plan);
    });
    return toTrainingPlanResponse(saved);
  }

  async activatePlan(
    actor: Actor,
    planId: string,
  ): Promise<TrainingPlanResponseDto> {
    const saved = await this.dataSource.transaction(async (manager) => {
      const caller = await this.access.currentUser(actor, manager);
      const plan = await this.access.lockedPlan(manager, planId);
      const trainingClass = await this.access.lockedTrainingClass(
        manager,
        plan.classId,
      );
      this.access.assertCanManageClass(
        actor,
        caller.id,
        trainingClass.headTrainerId,
      );
      assertPlanActivatable(plan.status);
      if (trainingClass.status !== TrainingClassStatus.ACTIVE) {
        throw new ConflictException('Class phải ACTIVE trước khi kích hoạt plan');
      }
      const sessionCount = await manager.countBy(TrainingSessionEntity, {
        planId,
      });
      if (!sessionCount)
        throw new ConflictException('Plan phải có ít nhất một session');
      const activeCount = await manager.countBy(TrainingPlanEntity, {
        classId: plan.classId,
        status: TrainingPlanStatus.ACTIVE,
      });
      if (activeCount)
        throw new ConflictException('Class đang có một plan ACTIVE khác');
      plan.status = TrainingPlanStatus.ACTIVE;
      plan.activatedAt = new Date();
      return manager.save(plan);
    });
    return toTrainingPlanResponse(saved);
  }

  async completePlan(
    actor: Actor,
    planId: string,
  ): Promise<TrainingPlanResponseDto> {
    const saved = await this.dataSource.transaction(async (manager) => {
      const caller = await this.access.currentUser(actor, manager);
      const plan = await this.access.lockedPlan(manager, planId);
      this.access.assertCanManageClass(
        actor,
        caller.id,
        plan.trainingClass.headTrainerId,
      );
      assertPlanCompletable(plan.status);
      const sessions = await manager.find(TrainingSessionEntity, {
        where: { planId },
      });
      if (!sessions.length) throw new ConflictException('Plan chưa có session');
      if (
        sessions.some(
          (session) =>
            session.status === TrainingSessionStatus.DRAFT ||
            session.status === TrainingSessionStatus.SCHEDULED,
        )
      ) {
        throw new ConflictException('Plan vẫn còn session chưa kết thúc');
      }
      const openParticipants = await manager.countBy(SessionParticipantEntity, {
        session: { planId },
        status: In([
          SessionParticipantStatus.PLANNED,
          SessionParticipantStatus.PRESENT,
          SessionParticipantStatus.READY,
          SessionParticipantStatus.ONGOING,
        ]),
      });
      if (openParticipants)
        throw new ConflictException('Plan vẫn còn participant chưa kết thúc');
      if (
        sessions.some(
          (session) => session.status === TrainingSessionStatus.IN_PROGRESS,
        )
      ) {
        throw new ConflictException('Plan vẫn còn session IN_PROGRESS');
      }
      plan.status = TrainingPlanStatus.COMPLETED;
      plan.completedAt = new Date();
      return manager.save(plan);
    });
    return toTrainingPlanResponse(saved);
  }

  async cancelPlan(
    actor: Actor,
    planId: string,
    body: CancelTrainingPlanDto,
  ): Promise<TrainingPlanResponseDto> {
    const saved = await this.dataSource.transaction(async (manager) => {
      const caller = await this.access.currentUser(actor, manager);
      const plan = await this.access.lockedPlan(manager, planId);
      this.access.assertCanManageClass(
        actor,
        caller.id,
        plan.trainingClass.headTrainerId,
      );
      assertPlanCancellable(plan.status);
      const ongoing = await manager.countBy(SessionParticipantEntity, {
        session: { planId },
        status: SessionParticipantStatus.ONGOING,
      });
      if (ongoing)
        throw new ConflictException(
          'Phải kết thúc participant đang ONGOING trước',
        );
      const now = new Date();
      await manager.update(
        TrainingSessionEntity,
        {
          planId,
          status: In([
            TrainingSessionStatus.DRAFT,
            TrainingSessionStatus.SCHEDULED,
            TrainingSessionStatus.IN_PROGRESS,
          ]),
        },
        {
          status: TrainingSessionStatus.CANCELLED,
          cancelledAt: now,
          cancelledBy: caller.id,
          cancelReason: `Plan bị hủy: ${body.reason}`,
        },
      );
      await manager
        .createQueryBuilder()
        .update(SessionParticipantEntity)
        .set({
          status: SessionParticipantStatus.CANCELLED,
          cancelReason: body.reason,
        })
        .where(
          'session_id IN (SELECT id FROM training_sessions WHERE plan_id = :planId)',
          { planId },
        )
        .andWhere('status IN (:...statuses)', {
          statuses: [
            SessionParticipantStatus.PLANNED,
            SessionParticipantStatus.PRESENT,
            SessionParticipantStatus.READY,
          ],
        })
        .execute();
      plan.status = TrainingPlanStatus.CANCELLED;
      plan.cancelledAt = now;
      plan.cancelReason = body.reason;
      return manager.save(plan);
    });
    return toTrainingPlanResponse(saved);
  }
}

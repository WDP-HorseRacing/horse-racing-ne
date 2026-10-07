import { ConflictException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import type { Actor } from '../../../common/types/actor';
import { GroomAssignmentEntity } from '../../stable/entities/groom-assignment.entity';
import { TrainingLockEntity } from '../../medical/entities/training-lock.entity';
import { TrainingLockStatus } from '../../medical/constants/training-lock.enum';
import { evaluateEligibility } from '../../horses/policies/horse.policy';
import {
  CancelTrainingSessionDto,
  CreateTrainingSessionDto,
  TrainingSessionResponseDto,
  UpdateTrainingSessionDto,
} from '../dto/training-session.dto';
import { HorseEnrollmentStatus } from '../enums/horse-enrollment-status.enum';
import { SessionParticipantStatus } from '../enums/session-participant-status.enum';
import { TrainingClassStatus } from '../enums/training-class-status.enum';
import { TrainingPlanStatus } from '../enums/training-plan-status.enum';
import { TrainingSessionStatus } from '../enums/training-session-status.enum';
import { TrainingSessionType } from '../enums/training-session-type.enum';
import { HorseEnrollmentEntity } from '../entities/horse-enrollment.entity';
import { SessionParticipantEntity } from '../entities/session-participant.entity';
import { TimeTrialEntity } from '../entities/time-trial.entity';
import { TrainingSessionEntity } from '../entities/training-session.entity';
import { toTrainingSessionResponse } from '../mappers/training-session.mapper';
import {
  assertSessionCancellable,
  assertSessionEditable,
  assertSessionPublishable,
  assertSessionWindowInPlan,
  eligibilityForSession,
  initialParticipantEligibility,
} from '../policies/training.policy';
import { TrainingAccessService } from '../shared/training-access.service';

@Injectable()
export class TrainingSessionsService {
  constructor(
    @InjectRepository(TrainingSessionEntity)
    private readonly sessions: Repository<TrainingSessionEntity>,
    private readonly access: TrainingAccessService,
    private readonly dataSource: DataSource,
  ) {}

  async listSessions(
    actor: Actor,
    planId: string,
  ): Promise<TrainingSessionResponseDto[]> {
    await this.access.planForActor(actor, planId);
    const rows = await this.sessions.find({
      where: { planId },
      order: { scheduledStartAt: 'ASC' },
    });
    return rows.map(toTrainingSessionResponse);
  }

  async getSessionById(
    actor: Actor,
    sessionId: string,
  ): Promise<TrainingSessionResponseDto> {
    return toTrainingSessionResponse(
      await this.access.sessionForActor(actor, sessionId),
    );
  }

  async createSession(
    actor: Actor,
    planId: string,
    body: CreateTrainingSessionDto,
  ): Promise<TrainingSessionResponseDto> {
    const row = await this.dataSource.transaction(async (manager) => {
      const caller = await this.access.currentUser(actor, manager);
      const plan = await this.access.lockedPlan(manager, planId);
      this.access.assertCanManageClass(
        actor,
        caller.id,
        plan.trainingClass.headTrainerId,
      );
      if (plan.trainingClass.status !== TrainingClassStatus.ACTIVE) {
        throw new ConflictException('Class phải ACTIVE để tạo session');
      }
      if (
        plan.status !== TrainingPlanStatus.SCHEDULED &&
        plan.status !== TrainingPlanStatus.ACTIVE
      ) {
        throw new ConflictException(
          'Không thể thêm session vào plan đã kết thúc',
        );
      }
      assertSessionWindowInPlan(
        body.scheduledStartAt,
        body.scheduledEndAt,
        plan.startDate,
        plan.endDate,
      );
      return manager.save(
        manager.create(TrainingSessionEntity, {
          planId,
          name: body.name,
          sessionType: body.sessionType,
          intensity: body.intensity,
          scheduledStartAt: new Date(body.scheduledStartAt),
          scheduledEndAt: new Date(body.scheduledEndAt),
          location: body.location ?? null,
          surface: body.surface ?? null,
          notes: body.notes ?? null,
          status: TrainingSessionStatus.DRAFT,
        }),
      );
    });
    return toTrainingSessionResponse(row);
  }

  async updateSession(
    actor: Actor,
    sessionId: string,
    body: UpdateTrainingSessionDto,
  ): Promise<TrainingSessionResponseDto> {
    const row = await this.dataSource.transaction(async (manager) => {
      const caller = await this.access.currentUser(actor, manager);
      const session = await this.access.lockedSession(manager, sessionId);
      const plan = await this.access.findPlan(manager, session.planId);
      this.access.assertCanManageClass(
        actor,
        caller.id,
        plan.trainingClass.headTrainerId,
      );
      if (
        plan.status !== TrainingPlanStatus.SCHEDULED &&
        plan.status !== TrainingPlanStatus.ACTIVE
      ) {
        throw new ConflictException(
          'Không thể sửa session của plan đã kết thúc',
        );
      }
      if (plan.trainingClass.status !== TrainingClassStatus.ACTIVE) {
        throw new ConflictException('Class phải ACTIVE để sửa session');
      }
      assertSessionEditable(session.status);
      const nextSessionType = body.sessionType ?? session.sessionType;
      if (nextSessionType !== session.sessionType) {
        const configuredTrial = await manager.findOneBy(TimeTrialEntity, {
          sessionId,
        });
        if (
          configuredTrial &&
          nextSessionType !== TrainingSessionType.TIME_TRIAL
        ) {
          throw new ConflictException(
            'Không thể đổi session về REGULAR khi đã có cấu hình Time Trial',
          );
        }
      }
      const start = body.scheduledStartAt
        ? new Date(body.scheduledStartAt)
        : session.scheduledStartAt;
      const end = body.scheduledEndAt
        ? new Date(body.scheduledEndAt)
        : session.scheduledEndAt;
      assertSessionWindowInPlan(start, end, plan.startDate, plan.endDate);
      Object.assign(session, {
        name: body.name ?? session.name,
        sessionType: nextSessionType,
        intensity: body.intensity ?? session.intensity,
        scheduledStartAt: start,
        scheduledEndAt: end,
        location: body.location ?? session.location,
        surface: body.surface ?? session.surface,
        notes: body.notes ?? session.notes,
      });
      return manager.save(session);
    });
    return toTrainingSessionResponse(row);
  }

  async publishSession(
    actor: Actor,
    sessionId: string,
  ): Promise<TrainingSessionResponseDto> {
    const row = await this.dataSource.transaction(async (manager) => {
      const caller = await this.access.currentUser(actor, manager);
      const session = await this.access.lockedSession(manager, sessionId);
      const plan = await this.access.findPlan(manager, session.planId);
      const trainingClass = await this.access.lockedTrainingClass(
        manager,
        plan.classId,
      );
      this.access.assertCanManageClass(
        actor,
        caller.id,
        trainingClass.headTrainerId,
      );
      assertSessionPublishable(session.status);
      if (trainingClass.status !== TrainingClassStatus.ACTIVE) {
        throw new ConflictException('Class không còn ACTIVE');
      }
      if (plan.status !== TrainingPlanStatus.ACTIVE) {
        throw new ConflictException(
          'Plan phải ACTIVE trước khi publish session',
        );
      }
      if (session.sessionType === TrainingSessionType.TIME_TRIAL) {
        const configuredTrial = await manager.findOneBy(TimeTrialEntity, {
          sessionId: session.id,
        });
        if (!configuredTrial) {
          throw new ConflictException(
            'Session TIME_TRIAL phải có cấu hình Time Trial trước khi publish',
          );
        }
      }
      const enrollments = await manager
        .getRepository(HorseEnrollmentEntity)
        .createQueryBuilder('enrollment')
        .where('enrollment.class_id = :classId', { classId: trainingClass.id })
        .andWhere('enrollment.status <> :cancelledStatus', {
          cancelledStatus: HorseEnrollmentStatus.CANCELLED,
        })
        .andWhere('enrollment.enrolled_at <= :scheduledStartAt', {
          scheduledStartAt: session.scheduledStartAt,
        })
        .andWhere(
          '(enrollment.left_at IS NULL OR :scheduledStartAt < enrollment.left_at)',
          { scheduledStartAt: session.scheduledStartAt },
        )
        .orderBy('enrollment.horse_id', 'ASC')
        .getMany();

      for (const enrollment of enrollments) {
        const horse = await this.access.lockedHorse(
          manager,
          enrollment.horseId,
        );
        await this.access.assertTrainerBarn(
          manager,
          actor,
          caller.id,
          horse.id,
        );
        const existing = await manager.findOneBy(SessionParticipantEntity, {
          sessionId: session.id,
          horseId: horse.id,
        });
        if (existing) continue;
        const activeLock = await manager.findOneBy(TrainingLockEntity, {
          horseId: horse.id,
          status: TrainingLockStatus.ACTIVE,
        });
        const eligibility = eligibilityForSession(
          evaluateEligibility({
            isDeleted: Boolean(horse.deletedAt),
            lifecycleStatus: horse.lifecycleStatus,
            healthStatus: horse.healthStatus,
            hasActiveTrainingLock: !!activeLock,
          }),
          session.intensity,
        );
        const groom = await this.findGroomAt(
          manager,
          horse.id,
          session.scheduledStartAt,
        );
        await manager.save(
          manager.create(SessionParticipantEntity, {
            sessionId: session.id,
            horseId: horse.id,
            horseEnrollmentId: enrollment.id,
            assignedGroomId: groom?.groomId ?? null,
            ...initialParticipantEligibility(eligibility, !!activeLock),
          }),
        );
      }
      session.status = TrainingSessionStatus.SCHEDULED;
      return manager.save(session);
    });
    return toTrainingSessionResponse(row);
  }

  async cancelSession(
    actor: Actor,
    sessionId: string,
    body: CancelTrainingSessionDto,
  ): Promise<TrainingSessionResponseDto> {
    const row = await this.dataSource.transaction(async (manager) => {
      const caller = await this.access.currentUser(actor, manager);
      const session = await this.access.lockedSession(manager, sessionId);
      const plan = await this.access.findPlan(manager, session.planId);
      this.access.assertCanManageClass(
        actor,
        caller.id,
        plan.trainingClass.headTrainerId,
      );
      assertSessionCancellable(session.status);
      const ongoing = await manager.countBy(SessionParticipantEntity, {
        sessionId,
        status: SessionParticipantStatus.ONGOING,
      });
      if (ongoing)
        throw new ConflictException(
          'Không thể hủy session đang có participant ONGOING',
        );
      await manager
        .createQueryBuilder()
        .update(SessionParticipantEntity)
        .set({
          status: SessionParticipantStatus.CANCELLED,
          cancelReason: body.reason,
        })
        .where('session_id = :sessionId', { sessionId })
        .andWhere('status IN (:...statuses)', {
          statuses: [
            SessionParticipantStatus.PLANNED,
            SessionParticipantStatus.PRESENT,
            SessionParticipantStatus.READY,
          ],
        })
        .execute();
      session.status = TrainingSessionStatus.CANCELLED;
      session.cancelledAt = new Date();
      session.cancelledBy = caller.id;
      session.cancelReason = body.reason;
      return manager.save(session);
    });
    return toTrainingSessionResponse(row);
  }

  private findGroomAt(manager: EntityManager, horseId: string, at: Date) {
    return manager
      .getRepository(GroomAssignmentEntity)
      .createQueryBuilder('assignment')
      .where('assignment.horse_id = :horseId', { horseId })
      .andWhere('assignment.start_at <= :at', { at })
      .andWhere('(assignment.end_at IS NULL OR :at < assignment.end_at)', {
        at,
      })
      .orderBy('assignment.start_at', 'DESC')
      .getOne();
  }
}

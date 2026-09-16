import { ConflictException, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { DomainEventPublisher } from '../../../common/infrastructure/events/domain-event.publisher';
import type { Actor } from '../../../common/types/actor';
import {
  HorseHealthStatus,
  HorseLifecycleStatus,
} from '../../horses/constants/horse-status.enum';
import { TrainingLockStatus } from '../../medical/constants/training-lock.enum';
import { TrainingLockEntity } from '../../medical/entities/training-lock.entity';
import { TrainingPlanStatus } from '../constants/training-plan-status.enum';
import { TrainingSessionStatus } from '../constants/training-session-status.enum';
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
import { TrainingSessionsRepository } from './training-sessions.repository';

@Injectable()
export class TrainingSessionsService {
  constructor(
    private readonly sessions: TrainingSessionsRepository,
    private readonly access: TrainingAccessService,
    private readonly dataSource: DataSource,
    private readonly events: DomainEventPublisher,
  ) {}

  async listSessions(
    actor: Actor,
    planId: string,
  ): Promise<TrainingSessionResponseDto[]> {
    await this.access.planForActor(actor, planId);
    return (await this.sessions.listByPlan(planId)).map(
      toTrainingSessionResponse,
    );
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
    const clubId = await this.access.clubId(actor);
    const row = await this.dataSource.transaction(async (manager) => {
      const plan = await this.access.lockedPlanInClub(manager, planId, clubId);
      if (
        plan.status !== TrainingPlanStatus.SCHEDULED &&
        plan.status !== TrainingPlanStatus.ACTIVE
      ) {
        throw new ConflictException(
          'Không thể thêm buổi tập vào giáo án đã kết thúc',
        );
      }
      assertSessionDateInPlan(body.scheduledAt, plan.startDate, plan.endDate);
      if (body.groomId)
        // kiểm tra Groom có trong club hay không
        await this.access.assertGroom(manager, body.groomId, clubId);
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

  async updateSession(
    actor: Actor,
    sessionId: string,
    body: UpdateTrainingSessionDto,
  ): Promise<TrainingSessionResponseDto> {
    const clubId = await this.access.clubId(actor);
    const session = await this.dataSource.transaction(async (manager) => {
      const curSession = await this.access.lockedSessionInClub(
        manager,
        sessionId,
        clubId,
      );
      assertSessionEditable(curSession.status);
      const plan = await manager.findOneByOrFail(TrainingPlanEntity, {
        id: curSession.planId,
      });
      if (body.scheduledAt) {
        assertSessionDateInPlan(body.scheduledAt, plan.startDate, plan.endDate);
        curSession.scheduledAt = new Date(body.scheduledAt);
      }
      if (body.groomId) {
        await this.access.assertGroom(manager, body.groomId, clubId);
        curSession.groomId = body.groomId;
      }
      if (body.distanceKm !== undefined) {
        curSession.distanceKm = body.distanceKm;
      }
      curSession.plannedDurationMinutes =
        body.plannedDurationMinutes ?? curSession.plannedDurationMinutes;
      curSession.intensity = body.intensity ?? curSession.intensity;
      curSession.surface = body.surface ?? curSession.surface;
      curSession.groomId = body.groomId ?? curSession.groomId;
      return manager.save(curSession);
    });
    return toTrainingSessionResponse(session);
  }

  async startSession(
    actor: Actor,
    sessionId: string,
  ): Promise<TrainingSessionResponseDto> {
    const caller = await this.access.currentUser(actor);
    const session = await this.dataSource.transaction(async (manager) => {
      const current = await this.access.lockedSessionInClub(
        manager,
        sessionId,
        caller.clubId,
      );
      this.access.assertCanOperateSession(actor, caller.id, current);
      assertSessionAbleToStart(current.status);
      const plan = await manager.findOneByOrFail(TrainingPlanEntity, {
        id: current.planId,
      });
      if (plan.status !== TrainingPlanStatus.ACTIVE)
        throw new ConflictException('Giáo án chưa ACTIVE');
      const horse = await this.access.lockedHorseInClub(
        manager,
        plan.horseId,
        caller.clubId,
      );
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
    this.events.publish('training.session.started', {
      sessionId: session.id,
      planId: session.planId,
    });
    return toTrainingSessionResponse(session);
  }

  async completeSession(
    actor: Actor,
    sessionId: string,
    body: CompleteTrainingSessionDto,
  ): Promise<TrainingSessionResponseDto> {
    const caller = await this.access.currentUser(actor);
    const session = await this.dataSource.transaction(async (manager) => {
      const current = await this.access.lockedSessionInClub(
        manager,
        sessionId,
        caller.clubId,
      );
      this.access.assertCanOperateSession(actor, caller.id, current);
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
    this.events.publish('training.session.completed', {
      sessionId: session.id,
      planId: session.planId,
    });
    return toTrainingSessionResponse(session);
  }

  async cancelSession(
    actor: Actor,
    sessionId: string,
    body: CancelTrainingSessionDto,
  ): Promise<TrainingSessionResponseDto> {
    const caller = await this.access.currentUser(actor);
    const session = await this.dataSource.transaction(async (manager) => {
      const current = await this.access.lockedSessionInClub(
        manager,
        sessionId,
        caller.clubId,
      );
      this.access.assertCanOperateSession(actor, caller.id, current);
      assertSessionCancellable(current.status);
      current.status = TrainingSessionStatus.CANCELLED;
      current.cancelledAt = new Date();
      current.cancelledBy = caller.id;
      current.cancelReason = body.reason;
      return manager.save(current);
    });
    this.events.publish('training.session.cancelled', {
      sessionId: session.id,
      planId: session.planId,
      reason: body.reason,
    });
    return toTrainingSessionResponse(session);
  }
}

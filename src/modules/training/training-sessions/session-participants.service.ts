import { ConflictException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import type { Actor } from '../../../common/types/actor';
import { evaluateEligibility } from '../../horses/policies/horse.policy';
import { TrainingLockEntity } from '../../medical/entities/training-lock.entity';
import { TrainingLockStatus } from '../../medical/constants/training-lock.enum';
import {
  AssignParticipantGroomDto,
  MarkParticipantAbsentDto,
  SessionParticipantResponseDto,
} from '../dto/session-participant.dto';
import { SessionParticipantStatus } from '../enums/session-participant-status.enum';
import { TrainingPlanStatus } from '../enums/training-plan-status.enum';
import { TrainingSessionStatus } from '../enums/training-session-status.enum';
import { SessionParticipantEntity } from '../entities/session-participant.entity';
import { toSessionParticipantResponse } from '../mappers/session-participant.mapper';
import {
  assertParticipantAbsent,
  assertParticipantCheckIn,
  assertParticipantComplete,
  assertParticipantReady,
  assertParticipantStart,
  assertSessionOperational,
} from '../policies/training.policy';
import { TrainingAccessService } from '../shared/training-access.service';
import { TrainingOperationsFacade } from '../shared/training-operations.facade';

@Injectable()
export class SessionParticipantsService {
  constructor(
    @InjectRepository(SessionParticipantEntity)
    private readonly participants: Repository<SessionParticipantEntity>,
    private readonly access: TrainingAccessService,
    private readonly operations: TrainingOperationsFacade,
    private readonly dataSource: DataSource,
  ) {}

  async list(
    actor: Actor,
    sessionId: string,
  ): Promise<SessionParticipantResponseDto[]> {
    await this.access.assertCanReadSession(actor, sessionId);
    const caller = await this.access.currentUser(actor);
    const rows = await this.participants.find({
      where: { sessionId },
      relations: { session: { plan: { trainingClass: true } } },
      order: { createdAt: 'ASC' },
    });
    const visible = await Promise.all(
      rows.map(async (row) =>
        (await this.access.canReadParticipant(
          actor,
          caller.id,
          row,
          this.dataSource.manager,
        ))
          ? row
          : null,
      ),
    );
    return visible.filter((row): row is SessionParticipantEntity => !!row).map(
      toSessionParticipantResponse,
    );
  }

  async assignGroom(
    actor: Actor,
    participantId: string,
    body: AssignParticipantGroomDto,
  ): Promise<SessionParticipantResponseDto> {
    const saved = await this.dataSource.transaction(async (manager) => {
      const caller = await this.access.currentUser(actor, manager);
      const snapshot = await this.access.findParticipant(
        manager,
        participantId,
      );
      const session = await this.access.lockedSession(
        manager,
        snapshot.sessionId,
      );
      const participant = await this.access.lockedParticipant(
        manager,
        participantId,
      );
      assertSessionOperational(session.status);
      const context = await this.access.findParticipant(manager, participantId);
      this.access.assertCanManageClass(
        actor,
        caller.id,
        context.session.plan.trainingClass.headTrainerId,
      );
      await this.access.assertTrainerBarn(
        manager,
        actor,
        caller.id,
        participant.horseId,
      );
      if (
        [
          SessionParticipantStatus.COMPLETED,
          SessionParticipantStatus.ABSENT,
          SessionParticipantStatus.INELIGIBLE,
          SessionParticipantStatus.CANCELLED,
          SessionParticipantStatus.CANCELLED_BY_LOCK,
        ].includes(participant.status)
      ) {
        throw new ConflictException(
          'Không thể assign Groom cho participant kết thúc',
        );
      }
      if (body.groomId) await this.access.assertGroom(manager, body.groomId);
      participant.assignedGroomId = body.groomId ?? null;
      return manager.save(participant);
    });
    return toSessionParticipantResponse(saved);
  }

  async checkIn(
    actor: Actor,
    participantId: string,
  ): Promise<SessionParticipantResponseDto> {
    return this.mutateParticipant(actor, participantId, (participant) => {
      assertParticipantCheckIn(participant.status);
      participant.status = SessionParticipantStatus.PRESENT;
      participant.checkedInAt = new Date();
    });
  }

  async absent(
    actor: Actor,
    participantId: string,
    body: MarkParticipantAbsentDto,
  ): Promise<SessionParticipantResponseDto> {
    return this.mutateParticipant(actor, participantId, (participant) => {
      assertParticipantAbsent(participant.status);
      participant.status = SessionParticipantStatus.ABSENT;
      participant.absenceReason = body.reason;
    });
  }

  async ready(
    actor: Actor,
    participantId: string,
  ): Promise<SessionParticipantResponseDto> {
    return this.mutateParticipant(actor, participantId, (participant) => {
      assertParticipantReady(participant.status);
      participant.status = SessionParticipantStatus.READY;
    });
  }

  async start(
    actor: Actor,
    participantId: string,
  ): Promise<SessionParticipantResponseDto> {
    const saved = await this.dataSource.transaction(async (manager) => {
      const caller = await this.access.currentUser(actor, manager);
      const snapshot = await this.access.findParticipant(
        manager,
        participantId,
      );
      // Lock ordering is intentional: Horse -> Session -> Participant. The
      // Medical flow uses the same Horse lock before changing TrainingLock.
      const horse = await this.access.lockedHorse(manager, snapshot.horseId);
      const session = await this.access.lockedSession(
        manager,
        snapshot.sessionId,
      );
      const participant = await this.access.lockedParticipant(
        manager,
        participantId,
      );
      const context = await this.access.findParticipant(manager, participantId);
      await this.access.assertCanOperateParticipant(
        manager,
        actor,
        caller.id,
        context,
      );
      assertParticipantStart(participant.status);
      const plan = await this.access.findPlan(manager, session.planId);
      if (plan.status !== TrainingPlanStatus.ACTIVE) {
        throw new ConflictException('Plan chưa ACTIVE');
      }
      if (
        session.status !== TrainingSessionStatus.SCHEDULED &&
        session.status !== TrainingSessionStatus.IN_PROGRESS
      ) {
        throw new ConflictException('Session không ở trạng thái thực thi');
      }
      const activeLock = await manager.findOneBy(TrainingLockEntity, {
        horseId: horse.id,
        status: TrainingLockStatus.ACTIVE,
      });
      const eligibility = evaluateEligibility({
        isDeleted: Boolean(horse.deletedAt),
        lifecycleStatus: horse.lifecycleStatus,
        healthStatus: horse.healthStatus,
        hasActiveTrainingLock: !!activeLock,
      });
      if (!eligibility.trainingEligible) {
        participant.status = activeLock
          ? SessionParticipantStatus.CANCELLED_BY_LOCK
          : SessionParticipantStatus.INELIGIBLE;
        participant.ineligibilityReason = eligibility.trainingReasons
          .join(',')
          .slice(0, 64);
        await manager.save(participant);
        throw new ConflictException('Ngựa không còn đủ điều kiện để bắt đầu');
      }
      if (
        await this.operations.hasOngoingParticipant(
          manager,
          horse.id,
          participant.id,
        )
      ) {
        throw new ConflictException('Ngựa đang có participant ONGOING khác');
      }
      participant.status = SessionParticipantStatus.ONGOING;
      participant.startedAt = new Date();
      await manager.save(participant);
      if (session.status === TrainingSessionStatus.SCHEDULED) {
        session.status = TrainingSessionStatus.IN_PROGRESS;
        await manager.save(session);
      }
      return participant;
    });
    return toSessionParticipantResponse(saved);
  }

  async complete(
    actor: Actor,
    participantId: string,
  ): Promise<SessionParticipantResponseDto> {
    const saved = await this.dataSource.transaction(async (manager) => {
      const caller = await this.access.currentUser(actor, manager);
      const snapshot = await this.access.findParticipant(
        manager,
        participantId,
      );
      const horse = await this.access.lockedHorse(manager, snapshot.horseId);
      const session = await this.access.lockedSession(
        manager,
        snapshot.sessionId,
      );
      const participant = await this.access.lockedParticipant(
        manager,
        participantId,
      );
      const context = await this.access.findParticipant(manager, participantId);
      await this.access.assertCanOperateParticipant(
        manager,
        actor,
        caller.id,
        context,
      );
      assertParticipantComplete(participant.status);
      if (session.status !== TrainingSessionStatus.IN_PROGRESS) {
        throw new ConflictException('Session chưa IN_PROGRESS');
      }
      participant.status = SessionParticipantStatus.COMPLETED;
      participant.completedAt = new Date();
      await manager.save(participant);
      await this.operations.refreshSessionStatus(
        manager,
        participant.sessionId,
      );
      void horse;
      return participant;
    });
    return toSessionParticipantResponse(saved);
  }

  private async mutateParticipant(
    actor: Actor,
    participantId: string,
    mutate: (participant: SessionParticipantEntity) => void,
  ): Promise<SessionParticipantResponseDto> {
    const saved = await this.dataSource.transaction(async (manager) => {
      const caller = await this.access.currentUser(actor, manager);
      const snapshot = await this.access.findParticipant(
        manager,
        participantId,
      );
      const session = await this.access.lockedSession(
        manager,
        snapshot.sessionId,
      );
      const participant = await this.access.lockedParticipant(
        manager,
        participantId,
      );
      assertSessionOperational(session.status);
      const context = await this.access.findParticipant(manager, participantId);
      await this.access.assertCanOperateParticipant(
        manager,
        actor,
        caller.id,
        context,
      );
      mutate(participant);
      const saved = await manager.save(participant);
      await this.operations.refreshSessionStatus(
        manager,
        participant.sessionId,
      );
      return saved;
    });
    return toSessionParticipantResponse(saved);
  }
}

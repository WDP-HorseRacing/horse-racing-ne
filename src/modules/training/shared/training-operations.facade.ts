import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { EntityManager, In } from 'typeorm';
import { SessionParticipantStatus } from '../enums/session-participant-status.enum';
import { TrainingSessionStatus } from '../enums/training-session-status.enum';
import { SessionParticipantEntity } from '../entities/session-participant.entity';
import { TrainingSessionEntity } from '../entities/training-session.entity';

const OPEN_PARTICIPANT_STATUSES = [
  SessionParticipantStatus.PLANNED,
  SessionParticipantStatus.PRESENT,
  SessionParticipantStatus.READY,
];

const NON_TERMINAL_PARTICIPANT_STATUSES = [
  ...OPEN_PARTICIPANT_STATUSES,
  SessionParticipantStatus.ONGOING,
];

@Injectable()
export class TrainingOperationsFacade {
  async assertParticipantCompleted(
    manager: EntityManager,
    participantId: string,
  ): Promise<SessionParticipantEntity> {
    const participant = await manager.findOneBy(SessionParticipantEntity, {
      id: participantId,
    });
    if (!participant) throw new NotFoundException('Không tìm thấy participant');
    if (participant.status !== SessionParticipantStatus.COMPLETED) {
      throw new ConflictException(
        'Chỉ participant COMPLETED mới được ghi dữ liệu performance',
      );
    }
    return participant;
  }

  async hasOngoingParticipant(
    manager: EntityManager,
    horseId: string,
    excludeParticipantId?: string,
  ): Promise<boolean> {
    const query = manager
      .getRepository(SessionParticipantEntity)
      .createQueryBuilder('participant')
      .where('participant.horse_id = :horseId', { horseId })
      .andWhere('participant.status = :status', {
        status: SessionParticipantStatus.ONGOING,
      });
    if (excludeParticipantId) {
      query.andWhere('participant.id <> :excludeParticipantId', {
        excludeParticipantId,
      });
    }
    return (await query.getCount()) > 0;
  }

  /**
   * Medical must call this while holding the same Horse pessimistic lock that
   * it uses to insert an ACTIVE TrainingLock. This closes the opposite race:
   * startParticipant() and createTrainingLock() cannot both commit for one
   * Horse.
   */
  async assertNoOngoingParticipant(
    manager: EntityManager,
    horseId: string,
  ): Promise<void> {
    if (await this.hasOngoingParticipant(manager, horseId)) {
      throw new ConflictException('Ngựa đang ONGOING, không thể tạo TrainingLock');
    }
  }

  async cancelFutureParticipationsByTrainingLock(
    manager: EntityManager,
    horseId: string,
    reason: string,
    now = new Date(),
  ): Promise<number> {
    return this.cancelFutureParticipations(
      manager,
      horseId,
      SessionParticipantStatus.CANCELLED_BY_LOCK,
      reason,
      now,
    );
  }

  async cancelFutureParticipationsByLifecycle(
    manager: EntityManager,
    horseId: string,
    reason: string,
    now = new Date(),
  ): Promise<number> {
    return this.cancelFutureParticipations(
      manager,
      horseId,
      SessionParticipantStatus.CANCELLED,
      reason,
      now,
    );
  }

  private async cancelFutureParticipations(
    manager: EntityManager,
    horseId: string,
    status: SessionParticipantStatus,
    reason: string,
    now: Date,
  ): Promise<number> {
    const rows = await manager
      .getRepository(SessionParticipantEntity)
      .createQueryBuilder('participant')
      .innerJoin(
        TrainingSessionEntity,
        'session',
        'session.id = participant.session_id',
      )
      .where('participant.horse_id = :horseId', { horseId })
      .andWhere('participant.status IN (:...statuses)', {
        statuses: OPEN_PARTICIPANT_STATUSES,
      })
      .andWhere('session.scheduled_start_at > :now', { now })
      .getMany();

    for (const row of rows) {
      row.status = status;
      row.cancelReason = reason;
    }
    if (rows.length) await manager.save(SessionParticipantEntity, rows);
    for (const sessionId of new Set(rows.map((row) => row.sessionId))) {
      await this.refreshSessionStatus(manager, sessionId);
    }
    return rows.length;
  }

  async refreshSessionStatus(
    manager: EntityManager,
    sessionId: string,
  ): Promise<TrainingSessionEntity> {
    const session = await manager.findOne(TrainingSessionEntity, {
      where: { id: sessionId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!session) throw new NotFoundException('Không tìm thấy buổi tập');
    if (
      session.status !== TrainingSessionStatus.SCHEDULED &&
      session.status !== TrainingSessionStatus.IN_PROGRESS
    ) {
      return session;
    }
    const open = await manager.countBy(SessionParticipantEntity, {
      sessionId,
      status: In(NON_TERMINAL_PARTICIPANT_STATUSES),
    });
    if (open === 0) {
      session.status = TrainingSessionStatus.COMPLETED;
      await manager.save(session);
    }
    return session;
  }
}

export { OPEN_PARTICIPANT_STATUSES, NON_TERMINAL_PARTICIPANT_STATUSES };

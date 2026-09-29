import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { EntityManager, In } from 'typeorm';
import { HorseEnrollmentStatus } from '../enums/horse-enrollment-status.enum';
import { SessionParticipantStatus } from '../enums/session-participant-status.enum';
import { TrainingSessionStatus } from '../enums/training-session-status.enum';
import { HorseEnrollmentEntity } from '../entities/horse-enrollment.entity';
import { SessionParticipantEntity } from '../entities/session-participant.entity';
import { TrainingSessionEntity } from '../entities/training-session.entity';

/**
 * Tham số khi hệ thống tự rút một con ngựa khỏi lớp.
 */
export interface WithdrawHorseOptions {
  /** Lý do ghi vào từng lượt tham gia bị hủy */
  reason: string;
  /** Thời điểm rút; buổi bắt đầu từ thời điểm này trở đi bị hủy lượt */
  at: Date;
  /** Giữ lại lớp do Head Trainer này phụ trách; bỏ trống là rút khỏi mọi lớp */
  exceptHeadTrainerId?: string;
}

/**
 * Kết quả rút ngựa khỏi lớp.
 */
export interface WithdrawHorseResult {
  /** UUID các lớp con ngựa vừa bị rút */
  classIds: string[];
  /** Số lượt tham gia buổi tập đã hủy */
  participantsCancelled: number;
}

const OPEN_PARTICIPANT_STATUSES = [
  SessionParticipantStatus.PLANNED,
  SessionParticipantStatus.PRESENT,
  SessionParticipantStatus.READY,
];

const HAPPENED_PARTICIPANT_STATUSES = [
  SessionParticipantStatus.COMPLETED,
  SessionParticipantStatus.ABSENT,
  SessionParticipantStatus.SKIPPED,
];

const NO_PARTICIPANT_LEFT_REASON = 'Không còn ngựa tham gia';

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

  /**
   * Rút một con ngựa khỏi các lớp đang học, chạy trong transaction của nơi gọi.
   *
   * - Chỉ xét enrollment ACTIVE; có `exceptHeadTrainerId` thì giữ lại lớp do Head Trainer đó phụ trách
   * - Enrollment đã bắt đầu (enrolledAt <= at) chuyển LEFT, ghi leftAt = at; enrollment chưa bắt đầu chuyển CANCELLED
   * - Hủy lượt tham gia các buổi từ `at` trở đi (cancelParticipantsFromEnrollments); buổi đã học và lượt ONGOING giữ nguyên
   * - Không kiểm quyền, nơi gọi tự kiểm
   *
   * @param manager EntityManager của transaction đang chạy
   * @param horseId UUID của ngựa
   * @param options Lý do, thời điểm rút và Head Trainer được giữ lớp (nếu có)
   * @returns A promise resolving to các lớp đã rút và số lượt tham gia đã hủy
   */
  async withdrawHorseFromClasses(
    manager: EntityManager,
    horseId: string,
    options: WithdrawHorseOptions,
  ): Promise<WithdrawHorseResult> {
    const query = manager
      .getRepository(HorseEnrollmentEntity)
      .createQueryBuilder('enrollment')
      .innerJoin('enrollment.trainingClass', 'class')
      .where('enrollment.horse_id = :horseId', { horseId })
      .andWhere('enrollment.status = :status', {
        status: HorseEnrollmentStatus.ACTIVE,
      });
    if (options.exceptHeadTrainerId) {
      query.andWhere(
        '(class.head_trainer_id IS NULL OR class.head_trainer_id <> :exceptHeadTrainerId)',
        { exceptHeadTrainerId: options.exceptHeadTrainerId },
      );
    }
    const enrollments = await query
      .setLock('pessimistic_write', undefined, ['enrollment'])
      .getMany();
    if (enrollments.length === 0) {
      return { classIds: [], participantsCancelled: 0 };
    }

    for (const enrollment of enrollments) {
      if (enrollment.enrolledAt > options.at) {
        enrollment.status = HorseEnrollmentStatus.CANCELLED;
      } else {
        enrollment.status = HorseEnrollmentStatus.LEFT;
        enrollment.leftAt = options.at;
      }
    }
    await manager.save(HorseEnrollmentEntity, enrollments);
    const participantsCancelled = await this.cancelParticipantsFromEnrollments(
      manager,
      enrollments.map((enrollment) => enrollment.id),
      options.at,
      options.reason,
    );
    return {
      classIds: enrollments.map((enrollment) => enrollment.classId),
      participantsCancelled,
    };
  }

  /**
   * Hủy các lượt tham gia chưa diễn ra của những enrollment vừa rời lớp.
   *
   * - Chỉ hủy lượt PLANNED/PRESENT/READY của buổi có giờ bắt đầu từ `from` trở đi
   * - Lượt ONGOING, lượt đã kết thúc và buổi trước `from` giữ nguyên
   * - Buổi không còn lượt nào mở thì cập nhật lại trạng thái buổi
   *
   * @param manager EntityManager của transaction đang chạy
   * @param enrollmentIds UUID các enrollment vừa rời lớp
   * @param from Thời điểm rời lớp; buổi bắt đầu từ thời điểm này trở đi bị hủy lượt
   * @param reason Lý do hủy ghi vào từng lượt
   * @returns A promise resolving to số lượt tham gia đã hủy
   */
  async cancelParticipantsFromEnrollments(
    manager: EntityManager,
    enrollmentIds: string[],
    from: Date,
    reason: string,
  ): Promise<number> {
    if (enrollmentIds.length === 0) return 0;
    const participants = await manager
      .getRepository(SessionParticipantEntity)
      .createQueryBuilder('participant')
      .innerJoin(
        TrainingSessionEntity,
        'session',
        'session.id = participant.session_id',
      )
      .where('participant.horse_enrollment_id IN (:...enrollmentIds)', {
        enrollmentIds,
      })
      .andWhere('participant.status IN (:...statuses)', {
        statuses: OPEN_PARTICIPANT_STATUSES,
      })
      .andWhere('session.scheduled_start_at >= :from', { from })
      .getMany();
    for (const participant of participants) {
      participant.status = SessionParticipantStatus.CANCELLED;
      participant.cancelReason = reason;
    }
    if (participants.length) {
      await manager.save(SessionParticipantEntity, participants);
    }
    for (const sessionId of new Set(participants.map((row) => row.sessionId))) {
      await this.refreshSessionStatus(manager, sessionId);
    }
    return participants.length;
  }

  /**
   * Chuyển các lượt tham gia buổi tập tương lai của một con ngựa sang groom mới, chạy trong transaction của nơi gọi.
   *
   * - Chuyển lượt đang giao cho groom cũ và lượt chưa ai dắt; lượt giao cho người khác giữ nguyên
   * - `fromGroomId` null: chỉ điền các lượt chưa ai dắt
   * - Chỉ lượt PLANNED/PRESENT/READY của buổi bắt đầu từ `from` trở đi; lượt ONGOING và lượt đã kết thúc giữ tên người đã làm
   * - Không kiểm quyền, nơi gọi tự kiểm
   *
   * @param manager EntityManager của transaction đang chạy
   * @param horseId UUID của ngựa
   * @param fromGroomId UUID groom cũ, null nếu ngựa chưa có Groom
   * @param toGroomId UUID groom mới
   * @param from Thời điểm đổi groom; buổi bắt đầu từ thời điểm này trở đi được chuyển
   * @returns A promise resolving to UUID các lượt tham gia đã chuyển
   */
  async moveFutureParticipantsToGroom(
    manager: EntityManager,
    horseId: string,
    fromGroomId: string | null,
    toGroomId: string,
    from: Date,
  ): Promise<string[]> {
    const participants = await manager
      .getRepository(SessionParticipantEntity)
      .createQueryBuilder('participant')
      .innerJoin(
        TrainingSessionEntity,
        'session',
        'session.id = participant.session_id',
      )
      .where('participant.horse_id = :horseId', { horseId })
      .andWhere(
        fromGroomId
          ? '(participant.assigned_groom_id = :fromGroomId OR participant.assigned_groom_id IS NULL)'
          : 'participant.assigned_groom_id IS NULL',
        { fromGroomId },
      )
      .andWhere('participant.status IN (:...statuses)', {
        statuses: OPEN_PARTICIPANT_STATUSES,
      })
      .andWhere('session.scheduled_start_at >= :from', { from })
      .setLock('pessimistic_write', undefined, ['participant'])
      .getMany();
    for (const participant of participants) {
      participant.assignedGroomId = toGroomId;
    }
    if (participants.length) {
      await manager.save(SessionParticipantEntity, participants);
    }
    return participants.map((participant) => participant.id);
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
      .andWhere('session.scheduled_start_at >= :now', { now })
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

  /**
   * Đóng buổi tập khi không còn lượt nào đang mở.
   *
   * - Chỉ xét buổi SCHEDULED hoặc IN_PROGRESS; buổi đã đóng giữ nguyên
   * - Còn lượt mở (PLANNED/PRESENT/READY/ONGOING): không đổi gì
   * - Hết lượt mở và có lượt COMPLETED, ABSENT hoặc SKIPPED: COMPLETED
   * - Hết lượt mở và mọi lượt đều bị hủy hoặc không đủ điều kiện: CANCELLED, ghi thời điểm và lý do "Không còn ngựa tham gia"
   *
   * @param manager EntityManager của transaction đang chạy
   * @param sessionId UUID của buổi tập
   * @returns A promise resolving to buổi tập sau khi cập nhật
   * @throws NotFoundException Nếu không có buổi tập
   */
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
    if (open > 0) return session;
    const happened = await manager.countBy(SessionParticipantEntity, {
      sessionId,
      status: In(HAPPENED_PARTICIPANT_STATUSES),
    });
    if (happened > 0) {
      session.status = TrainingSessionStatus.COMPLETED;
    } else {
      session.status = TrainingSessionStatus.CANCELLED;
      session.cancelledAt = new Date();
      session.cancelReason = NO_PARTICIPANT_LEFT_REASON;
    }
    await manager.save(session);
    return session;
  }
}

export { OPEN_PARTICIPANT_STATUSES, NON_TERMINAL_PARTICIPANT_STATUSES };

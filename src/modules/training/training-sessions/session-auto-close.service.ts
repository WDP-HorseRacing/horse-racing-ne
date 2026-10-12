import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DataSource, In } from 'typeorm';
import { MISSED_CHECK_IN_REASON } from '../constants/participant-window.constants';
import { SessionParticipantEntity } from '../entities/session-participant.entity';
import { TrainingSessionEntity } from '../entities/training-session.entity';
import { SessionParticipantStatus } from '../enums/session-participant-status.enum';
import { TrainingSessionStatus } from '../enums/training-session-status.enum';
import {
  NON_TERMINAL_PARTICIPANT_STATUSES,
  TrainingOperationsFacade,
} from '../shared/training-operations.facade';

const CLOSE_BATCH_SIZE = 100;

const UNSTARTED_PARTICIPANT_STATUSES = [
  SessionParticipantStatus.PLANNED,
  SessionParticipantStatus.PRESENT,
  SessionParticipantStatus.READY,
];

@Injectable()
export class SessionAutoCloseService {
  private readonly logger = new Logger(SessionAutoCloseService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly operations: TrainingOperationsFacade,
  ) {}

  /**
   * Job mỗi phút: chốt lượt của các buổi đã hết giờ, rồi đóng các buổi đã tới giờ bắt đầu mà không còn lượt mở
   *
   * - Lỗi của từng bước chỉ được log, không chặn bước còn lại và không làm dừng scheduler
   *
   * @returns Promise hoàn tất khi đã chạy xong
   */
  @Cron(CronExpression.EVERY_MINUTE, { name: 'training-session-auto-close' })
  async runEveryMinute(): Promise<void> {
    try {
      const settled = await this.settleEndedSessions();
      if (settled)
        this.logger.log(`Đã chốt lượt của ${settled} buổi tập hết giờ`);
    } catch (error) {
      this.logger.error(
        'Chốt lượt của buổi tập hết giờ thất bại',
        error instanceof Error ? error.stack : String(error),
      );
    }
    try {
      const closed = await this.closeStartedSessions();
      if (closed) this.logger.log(`Đã đóng ${closed} buổi tập quá giờ`);
    } catch (error) {
      this.logger.error(
        'Đóng buổi tập quá giờ thất bại',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  /**
   * Chốt các lượt chưa tập của một lô buổi đã hết giờ, trong một transaction, rồi cập nhật trạng thái buổi
   *
   * - Chỉ xét buổi SCHEDULED hoặc IN_PROGRESS đã qua giờ kết thúc và còn lượt chưa tập
   * - Lượt chưa điểm danh (PLANNED): ABSENT, lý do MISSED_CHECK_IN_REASON
   * - Lượt có mặt hoặc sẵn sàng mà chưa bắt đầu (PRESENT, READY): SKIPPED
   * - Lượt đang tập (ONGOING) giữ nguyên
   * - Mỗi lô tối đa CLOSE_BATCH_SIZE buổi, buổi hết giờ sớm nhất trước; bỏ qua buổi hoặc lượt đang bị transaction khác khóa, lần chạy sau xử lý tiếp
   *
   * @param now Thời điểm chạy
   * @returns Promise trả về số buổi đã chốt lượt trong lô
   */
  async settleEndedSessions(now: Date = new Date()): Promise<number> {
    return this.dataSource.transaction(async (manager) => {
      const sessions = await manager
        .getRepository(TrainingSessionEntity)
        .createQueryBuilder('session')
        .where('session.status IN (:...statuses)', {
          statuses: [
            TrainingSessionStatus.SCHEDULED,
            TrainingSessionStatus.IN_PROGRESS,
          ],
        })
        .andWhere('session.scheduled_end_at <= :now', { now })
        .andWhere(
          (qb) =>
            `EXISTS ${qb
              .subQuery()
              .select('1')
              .from(SessionParticipantEntity, 'participant')
              .where('participant.session_id = session.id')
              .andWhere('participant.status IN (:...unstarted)')
              .getQuery()}`,
        )
        .setParameter('unstarted', UNSTARTED_PARTICIPANT_STATUSES)
        .orderBy('session.scheduled_end_at', 'ASC')
        .limit(CLOSE_BATCH_SIZE)
        .setLock('pessimistic_write')
        .setOnLocked('skip_locked')
        .getMany();
      for (const session of sessions) {
        const participants = await manager
          .getRepository(SessionParticipantEntity)
          .createQueryBuilder('participant')
          .where('participant.session_id = :sessionId', {
            sessionId: session.id,
          })
          .andWhere('participant.status IN (:...unstarted)', {
            unstarted: UNSTARTED_PARTICIPANT_STATUSES,
          })
          .setLock('pessimistic_write')
          .setOnLocked('skip_locked')
          .getMany();
        const missedIds = participants
          .filter((p) => p.status === SessionParticipantStatus.PLANNED)
          .map((p) => p.id);
        const skippedIds = participants
          .filter((p) => p.status !== SessionParticipantStatus.PLANNED)
          .map((p) => p.id);
        if (missedIds.length > 0) {
          await manager.update(
            SessionParticipantEntity,
            { id: In(missedIds) },
            {
              status: SessionParticipantStatus.ABSENT,
              absenceReason: MISSED_CHECK_IN_REASON,
            },
          );
        }
        if (skippedIds.length > 0) {
          await manager.update(
            SessionParticipantEntity,
            { id: In(skippedIds) },
            { status: SessionParticipantStatus.SKIPPED },
          );
        }
        await this.operations.refreshSessionStatus(manager, session.id);
      }
      return sessions.length;
    });
  }

  /**
   * Đóng một lô buổi SCHEDULED đã tới giờ bắt đầu mà không còn lượt mở, trong một transaction
   *
   * - Mỗi lô tối đa CLOSE_BATCH_SIZE buổi, giờ bắt đầu sớm nhất trước
   * - Khóa row buổi và bỏ qua buổi đang bị transaction khác khóa, nên chạy chồng không đóng trùng
   * - Mỗi buổi đóng theo refreshSessionStatus: có lượt đã diễn ra thì COMPLETED, không thì CANCELLED
   *
   * @returns Promise trả về số buổi đã đóng trong lô
   */
  async closeStartedSessions(): Promise<number> {
    return this.dataSource.transaction(async (manager) => {
      const sessions = await manager
        .getRepository(TrainingSessionEntity)
        .createQueryBuilder('session')
        .where('session.status = :status', {
          status: TrainingSessionStatus.SCHEDULED,
        })
        .andWhere('session.scheduled_start_at <= :now', { now: new Date() })
        .andWhere(
          (qb) =>
            `NOT EXISTS ${qb
              .subQuery()
              .select('1')
              .from(SessionParticipantEntity, 'participant')
              .where('participant.session_id = session.id')
              .andWhere('participant.status IN (:...openStatuses)')
              .getQuery()}`,
        )
        .setParameter('openStatuses', NON_TERMINAL_PARTICIPANT_STATUSES)
        .orderBy('session.scheduled_start_at', 'ASC')
        .limit(CLOSE_BATCH_SIZE)
        .setLock('pessimistic_write')
        .setOnLocked('skip_locked')
        .getMany();
      for (const session of sessions) {
        await this.operations.refreshSessionStatus(manager, session.id);
      }
      return sessions.length;
    });
  }
}

import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DataSource } from 'typeorm';
import { SessionParticipantEntity } from '../entities/session-participant.entity';
import { TrainingSessionEntity } from '../entities/training-session.entity';
import { TrainingSessionStatus } from '../enums/training-session-status.enum';
import {
  NON_TERMINAL_PARTICIPANT_STATUSES,
  TrainingOperationsFacade,
} from '../shared/training-operations.facade';

const CLOSE_BATCH_SIZE = 100;

@Injectable()
export class SessionAutoCloseService {
  private readonly logger = new Logger(SessionAutoCloseService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly operations: TrainingOperationsFacade,
  ) {}

  /**
   * Job mỗi phút: đóng các buổi đã tới giờ bắt đầu mà không còn lượt mở
   *
   * - Lỗi chỉ được log, không làm dừng scheduler
   *
   * @returns Promise hoàn tất khi đã chạy xong
   */
  @Cron(CronExpression.EVERY_MINUTE, { name: 'training-session-auto-close' })
  async runEveryMinute(): Promise<void> {
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

import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DataSource, In } from 'typeorm';
import { clubToday } from '../../../common/utils/club-date';
import { AuditAction } from '../../audit/constants/audit-action.enum';
import { AuditEntityType } from '../../audit/constants/audit-entity-type.enum';
import { AuditFeature } from '../../audit/constants/audit-feature.enum';
import { AuditService } from '../../audit/services/audit.service';
import {
  AUTO_COMPLETED_CLASS_REASON,
  AUTO_COMPLETED_RUN_REASON,
  MISSED_CHECK_IN_REASON,
  STUCK_RUN_GRACE_MS,
} from '../constants/participant-window.constants';
import { SessionParticipantEntity } from '../entities/session-participant.entity';
import { TrainingClassEntity } from '../entities/training-class.entity';
import { TrainingSessionEntity } from '../entities/training-session.entity';
import { SessionParticipantStatus } from '../enums/session-participant-status.enum';
import { TrainingClassStatus } from '../enums/training-class-status.enum';
import { TrainingSessionStatus } from '../enums/training-session-status.enum';
import { completeTrainingClass } from '../shared/training-class-completion';
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
    private readonly auditService: AuditService,
  ) {}

  /**
   * Job mỗi phút: tự hoàn thành lượt đang tập bị quên, chốt lượt của các buổi đã hết giờ, đóng các buổi đã tới giờ bắt đầu mà không còn lượt mở, rồi tự hoàn thành các lớp đã qua ngày kết thúc
   *
   * - Lỗi của từng bước chỉ được log, không chặn bước còn lại và không làm dừng scheduler
   *
   * @returns Promise hoàn tất khi đã chạy xong
   */
  @Cron(CronExpression.EVERY_MINUTE, { name: 'training-session-auto-close' })
  async runEveryMinute(): Promise<void> {
    try {
      const completed = await this.completeStuckRuns();
      if (completed)
        this.logger.log(`Đã tự hoàn thành ${completed} lượt đang tập bị quên`);
    } catch (error) {
      this.logger.error(
        'Tự hoàn thành lượt đang tập bị quên thất bại',
        error instanceof Error ? error.stack : String(error),
      );
    }
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
    try {
      const finished = await this.completeEndedClasses();
      if (finished)
        this.logger.log(`Đã tự hoàn thành ${finished} lớp quá ngày kết thúc`);
    } catch (error) {
      this.logger.error(
        'Tự hoàn thành lớp quá ngày kết thúc thất bại',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  /**
   * Tự hoàn thành các lượt đang tập của một lô buổi đã quá giờ kết thúc ít nhất 30 phút, trong một transaction, rồi cập nhật trạng thái buổi
   *
   * - Lượt ONGOING: COMPLETED, thời điểm hoàn thành = giờ kết thúc dự kiến của buổi
   * - Ghi nhật ký từng lượt với người thao tác null, lý do AUTO_COMPLETED_RUN_REASON
   * - Mỗi lô tối đa CLOSE_BATCH_SIZE buổi, buổi hết giờ sớm nhất trước; khóa buổi rồi tới lượt, bỏ qua row đang bị transaction khác khóa
   *
   * @param now Thời điểm chạy
   * @returns Promise trả về số lượt đã tự hoàn thành
   */
  async completeStuckRuns(now: Date = new Date()): Promise<number> {
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
        .andWhere('session.scheduled_end_at <= :cutoff', {
          cutoff: new Date(now.getTime() - STUCK_RUN_GRACE_MS),
        })
        .andWhere(
          (qb) =>
            `EXISTS ${qb
              .subQuery()
              .select('1')
              .from(SessionParticipantEntity, 'participant')
              .where('participant.session_id = session.id')
              .andWhere('participant.status = :ongoing')
              .getQuery()}`,
        )
        .setParameter('ongoing', SessionParticipantStatus.ONGOING)
        .orderBy('session.scheduled_end_at', 'ASC')
        .limit(CLOSE_BATCH_SIZE)
        .setLock('pessimistic_write')
        .setOnLocked('skip_locked')
        .getMany();
      let completed = 0;
      for (const session of sessions) {
        const runs = await manager
          .getRepository(SessionParticipantEntity)
          .createQueryBuilder('participant')
          .where('participant.session_id = :sessionId', {
            sessionId: session.id,
          })
          .andWhere('participant.status = :ongoing', {
            ongoing: SessionParticipantStatus.ONGOING,
          })
          .setLock('pessimistic_write')
          .setOnLocked('skip_locked')
          .getMany();
        for (const run of runs) {
          run.status = SessionParticipantStatus.COMPLETED;
          run.completedAt = session.scheduledEndAt;
          await manager.save(run);
          await this.auditService.record(manager, {
            actorId: null,
            action: AuditAction.UPDATE,
            entityType: AuditEntityType.SESSION_PARTICIPANT,
            entityId: run.id,
            before: { status: SessionParticipantStatus.ONGOING },
            after: { status: run.status },
            reason: AUTO_COMPLETED_RUN_REASON,
            feature: AuditFeature.TRAIN_RUN,
          });
          completed += 1;
        }
        await this.operations.refreshSessionStatus(manager, session.id);
      }
      return completed;
    });
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

  /**
   * Tự hoàn thành một lô lớp đang chạy đã qua ngày kết thúc mà không còn buổi tập chưa kết thúc, trong một transaction
   *
   * - Chỉ xét lớp ACTIVE có ngày kết thúc trước ngày hôm nay theo lịch câu lạc bộ; lớp kết thúc hôm nay chưa bị đóng
   * - Lớp còn buổi SCHEDULED hoặc IN_PROGRESS giữ nguyên, các bước đóng buổi chạy trước sẽ xử lý buổi đó
   * - Ngựa đang học chuyển sang rời lớp; ghi nhật ký với người thao tác null, lý do AUTO_COMPLETED_CLASS_REASON
   * - Mỗi lô tối đa CLOSE_BATCH_SIZE lớp, lớp kết thúc sớm nhất trước; bỏ qua lớp đang bị transaction khác khóa, lần chạy sau xử lý tiếp
   *
   * @param today Ngày hôm nay theo lịch câu lạc bộ (YYYY-MM-DD)
   * @returns Promise trả về số lớp đã tự hoàn thành
   */
  async completeEndedClasses(today: string = clubToday()): Promise<number> {
    return this.dataSource.transaction(async (manager) => {
      const classes = await manager
        .getRepository(TrainingClassEntity)
        .createQueryBuilder('class')
        .where('class.status = :status', {
          status: TrainingClassStatus.ACTIVE,
        })
        .andWhere('class.end_date < :today', { today })
        .andWhere(
          (qb) =>
            `NOT EXISTS ${qb
              .subQuery()
              .select('1')
              .from(TrainingSessionEntity, 'session')
              .where('session.class_id = class.id')
              .andWhere('session.status IN (:...openSessionStatuses)')
              .getQuery()}`,
        )
        .setParameter('openSessionStatuses', [
          TrainingSessionStatus.SCHEDULED,
          TrainingSessionStatus.IN_PROGRESS,
        ])
        .orderBy('class.end_date', 'ASC')
        .limit(CLOSE_BATCH_SIZE)
        .setLock('pessimistic_write')
        .setOnLocked('skip_locked')
        .getMany();
      for (const row of classes) {
        await completeTrainingClass(
          manager,
          this.auditService,
          row,
          null,
          AUTO_COMPLETED_CLASS_REASON,
        );
      }
      return classes.length;
    });
  }
}

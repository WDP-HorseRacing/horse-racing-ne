import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Cron, SchedulerRegistry } from '@nestjs/schedule';
import { DataSource } from 'typeorm';
import { CLUB_TIME_ZONE } from '../../../common/constants/club.constants';
import { DomainEventPublisher } from '../../../common/infrastructure/events/domain-event.publisher';
import type { Actor } from '../../../common/types/actor';
import { clubToday } from '../../../common/utils/club-date';
import { deterministicUuid } from '../../../common/utils/deterministic-uuid';
import { AuditAction } from '../../audit/constants/audit-action.enum';
import { AuditEntityType } from '../../audit/constants/audit-entity-type.enum';
import { AuditFeature } from '../../audit/constants/audit-feature.enum';
import { AuditService } from '../../audit/services/audit.service';
import { currentUserForActor } from '../../users/utils/current-user';
import {
  ChecklistJob,
  checklistRetryName,
} from '../constants/checklist-job.enum';
import {
  CHECKLIST_FAILURE_NOTICE_ATTEMPT,
  CHECKLIST_RETRY_DELAYS_MINUTES,
} from '../constants/daily-checklist.constants';
import {
  CHECKLIST_GENERATION_FAILED_EVENT,
  CHECKLIST_GENERATION_RECOVERED_EVENT,
} from '../constants/stable-events.constants';
import { RegenerateChecklistsResponseDto } from '../dto/daily-checklist.dto';
import { toRegenerateChecklistsResponse } from '../mappers/daily-checklist.mapper';
import type {
  ChecklistGenerationFailedEvent,
  ChecklistGenerationRecoveredEvent,
} from '../types/stable-events.types';
import type { ChecklistGenerationResult } from '../types/stable.types';
import { ChecklistsService } from './checklists.service';

const MINUTE_MS = 60_000;

/**
 * Chạy việc checklist hằng ngày, thử lại khi lỗi, báo Club Manager khi lỗi kéo dài và cho Club Manager sinh lại checklist hôm nay
 *
 * - Ngày đã báo lỗi, đã báo "đã đủ" được nhớ trong bộ nhớ tiến trình; khởi động lại thì quên
 */
@Injectable()
export class ChecklistGenerationService implements OnApplicationBootstrap {
  private readonly logger = new Logger(ChecklistGenerationService.name);
  private failureNotifiedOn: string | null = null;
  private recoveryNotifiedOn: string | null = null;

  constructor(
    private readonly checklists: ChecklistsService,
    private readonly dataSource: DataSource,
    private readonly events: DomainEventPublisher,
    private readonly auditService: AuditService,
    private readonly scheduler: SchedulerRegistry,
  ) {}

  /**
   * Chạy bù một lần khi ứng dụng khởi động: đóng checklist của các ngày đã qua còn mở, sinh checklist hôm nay
   *
   * @returns Promise hoàn tất khi đã chạy xong lần đầu (lần thử lại chạy sau theo hẹn)
   */
  async onApplicationBootstrap(): Promise<void> {
    await this.runDaily();
  }

  /**
   * Chạy lúc 00:05 giờ CLB: đóng checklist của các ngày đã qua còn mở, rồi sinh checklist hôm nay
   *
   * - Hai việc độc lập, mỗi việc tự hẹn thử lại khi lỗi; lỗi không làm dừng scheduler
   *
   * @returns Promise hoàn tất khi đã chạy xong lần đầu của cả hai việc
   */
  @Cron('5 0 * * *', {
    name: 'daily-checklists-close-and-generate',
    timeZone: CLUB_TIME_ZONE,
  })
  async runDaily(): Promise<void> {
    const today = clubToday();
    await this.closePastDays(today, 1);
    await this.generateToday(today, 1);
  }

  /**
   * Đóng checklist của các ngày trước date còn mở; lỗi thì hẹn thử lại
   *
   * - Hủy hẹn thử lại cũ của việc này trước khi chạy
   * - Đã sang ngày khác date thì dừng, không chạy và không hẹn
   * - Lỗi: log ERROR, hẹn lần sau theo CHECKLIST_RETRY_DELAYS_MINUTES
   *
   * @param date Ngày đang xử lý theo lịch CLB, YYYY-MM-DD
   * @param attempt Lần chạy thứ mấy trong ngày, lần chạy chính là 1
   * @returns Promise hoàn tất khi đã chạy xong lần này
   */
  async closePastDays(date: string, attempt: number): Promise<void> {
    this.clearRetry(ChecklistJob.CLOSE_PAST_DAYS);
    if (clubToday() !== date) return;
    try {
      const closed = await this.checklists.closePastDays(date);
      this.logger.log(`Đóng checklist ngày đã qua: ${closed}`);
    } catch (error) {
      this.logger.error(
        `Đóng checklist ngày đã qua lỗi (lần ${attempt})`,
        error as Error,
      );
      this.scheduleRetry(ChecklistJob.CLOSE_PAST_DAYS, attempt, () =>
        this.closePastDays(date, attempt + 1),
      );
    }
  }

  /**
   * Sinh checklist của date cho ngựa còn thiếu; còn ngựa lỗi thì hẹn thử lại
   *
   * - Hủy hẹn thử lại cũ của việc này trước khi chạy
   * - Đã sang ngày khác date thì dừng, không chạy và không hẹn
   * - Sinh đủ: dừng thử lại; nếu đã báo lỗi trong ngày thì báo Club Manager "đã đủ" một lần
   * - Còn lỗi: log ERROR; từ lần thứ CHECKLIST_FAILURE_NOTICE_ATTEMPT thì báo Club Manager một lần trong ngày; hẹn lần sau
   *
   * @param date Ngày đang xử lý theo lịch CLB, YYYY-MM-DD
   * @param attempt Lần chạy thứ mấy trong ngày, lần chạy chính là 1
   * @returns Promise trả về kết quả lần sinh, hoặc null nếu đã sang ngày khác hoặc không đọc được danh sách ngựa
   */
  async generateToday(
    date: string,
    attempt: number,
  ): Promise<ChecklistGenerationResult | null> {
    this.clearRetry(ChecklistJob.GENERATE_TODAY);
    if (clubToday() !== date) return null;
    let result: ChecklistGenerationResult | null = null;
    try {
      result = await this.checklists.generateDay(date);
    } catch (error) {
      this.logger.error(
        `Sinh checklist ngày ${date} lỗi (lần ${attempt})`,
        error as Error,
      );
    }
    if (result && result.failures.length === 0) {
      this.logger.log(`Sinh checklist ngày ${date}: ${result.generated} mới`);
      await this.notifyRecovered(date);
      return result;
    }
    if (result) {
      this.logger.error(
        `Sinh checklist ngày ${date} còn ${result.failures.length} ngựa lỗi (lần ${attempt})`,
      );
    }
    if (attempt >= CHECKLIST_FAILURE_NOTICE_ATTEMPT) {
      await this.notifyFailed(
        date,
        result?.failures.map((failure) => failure.horseName) ?? [],
      );
    }
    this.scheduleRetry(ChecklistJob.GENERATE_TODAY, attempt, () =>
      this.generateToday(date, attempt + 1),
    );
    return result;
  }

  /**
   * Club Manager sinh lại checklist hôm nay cho ngựa còn thiếu, ghi nhật ký mỗi lần bấm
   *
   * - Chỉ sinh ngựa chưa có checklist hôm nay; checklist đã sinh giữ nguyên; bấm nhiều lần hay trùng lúc với lần thử lại không sinh trùng
   * - Sinh đủ: dừng thử lại; nếu đã báo lỗi trong ngày thì báo Club Manager "đã đủ" một lần
   *
   * @param actor Thông tin danh tính từ Access Token
   * @returns Promise trả về ngày, số checklist vừa sinh và các ngựa vẫn lỗi
   * @throws ForbiddenException Nếu tài khoản không tồn tại hoặc không hoạt động
   */
  async regenerateToday(
    actor: Actor,
  ): Promise<RegenerateChecklistsResponseDto> {
    const caller = await currentUserForActor(this.dataSource.manager, actor);
    const today = clubToday();
    const result = await this.checklists.generateDay(today);
    await this.dataSource.transaction((manager) =>
      this.auditService.record(manager, {
        actorId: caller.id,
        action: AuditAction.CREATE,
        entityType: AuditEntityType.DAILY_CHECKLIST,
        entityId: deterministicUuid(`daily-checklists:${today}`),
        before: null,
        after: {
          date: today,
          generated: result.generated,
          failedHorseIds: result.failures.map((failure) => failure.horseId),
        },
        feature: AuditFeature.CHECKLIST,
      }),
    );
    if (result.failures.length === 0) {
      this.clearRetry(ChecklistJob.GENERATE_TODAY);
      await this.notifyRecovered(today);
    }
    return toRegenerateChecklistsResponse(today, result);
  }

  /**
   * Hẹn chạy lại một việc sau số phút theo lần lỗi, thay hẹn cũ của việc đó
   *
   * @param job Việc checklist
   * @param attempt Lần vừa lỗi
   * @param run Hàm chạy lần sau
   */
  private scheduleRetry(
    job: ChecklistJob,
    attempt: number,
    run: () => Promise<unknown>,
  ): void {
    const delays = CHECKLIST_RETRY_DELAYS_MINUTES;
    const minutes = delays[Math.min(attempt, delays.length) - 1];
    this.clearRetry(job);
    this.scheduler.addTimeout(
      checklistRetryName(job),
      setTimeout(() => {
        run().catch((error: unknown) =>
          this.logger.error(`Thử lại ${job} lỗi`, error as Error),
        );
      }, minutes * MINUTE_MS),
    );
  }

  /**
   * Hủy hẹn thử lại đang chờ của một việc, không có thì bỏ qua
   *
   * @param job Việc checklist
   */
  private clearRetry(job: ChecklistJob): void {
    const name = checklistRetryName(job);
    if (this.scheduler.doesExist('timeout', name)) {
      this.scheduler.deleteTimeout(name);
    }
  }

  /**
   * Ghi CHECKLIST_GENERATION_FAILED_EVENT một lần trong ngày để báo Club Manager
   *
   * - Ghi lỗi chỉ được log
   *
   * @param date Ngày của checklist, YYYY-MM-DD
   * @param horseNames Tên các ngựa chưa sinh được checklist
   * @returns Promise hoàn tất khi đã ghi hoặc bỏ qua
   */
  private async notifyFailed(
    date: string,
    horseNames: string[],
  ): Promise<void> {
    if (this.failureNotifiedOn === date) return;
    const event: ChecklistGenerationFailedEvent = {
      eventId: deterministicUuid(`checklist-generation-failed:${date}`),
      date,
      horseNames,
    };
    try {
      await this.dataSource.transaction((manager) =>
        this.events.publish(manager, CHECKLIST_GENERATION_FAILED_EVENT, event),
      );
      this.failureNotifiedOn = date;
    } catch (error) {
      this.logger.error('Ghi thông báo checklist lỗi thất bại', error as Error);
    }
  }

  /**
   * Ghi CHECKLIST_GENERATION_RECOVERED_EVENT một lần trong ngày, chỉ khi đã báo lỗi ngày đó
   *
   * - Ghi lỗi chỉ được log
   *
   * @param date Ngày của checklist, YYYY-MM-DD
   * @returns Promise hoàn tất khi đã ghi hoặc bỏ qua
   */
  private async notifyRecovered(date: string): Promise<void> {
    if (this.failureNotifiedOn !== date || this.recoveryNotifiedOn === date) {
      return;
    }
    const event: ChecklistGenerationRecoveredEvent = {
      eventId: deterministicUuid(`checklist-generation-recovered:${date}`),
      date,
    };
    try {
      await this.dataSource.transaction((manager) =>
        this.events.publish(
          manager,
          CHECKLIST_GENERATION_RECOVERED_EVENT,
          event,
        ),
      );
      this.recoveryNotifiedOn = date;
    } catch (error) {
      this.logger.error(
        'Ghi thông báo checklist đã đủ thất bại',
        error as Error,
      );
    }
  }
}

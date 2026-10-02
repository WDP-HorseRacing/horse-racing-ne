import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { DomainEventPublisher } from '../../../common/infrastructure/events/domain-event.publisher';
import { deterministicUuid } from '../../../common/utils/deterministic-uuid';
import { CLUB_TIME_ZONE } from '../../horses/constants/horse.constants';
import {
  MEDICAL_CARE_SCHEDULE_DUE_EVENT,
  MEDICAL_CHECKUP_OVERDUE_EVENT,
} from '../constants/medical-events.constants';
import {
  checkupDueDate,
  isOverdueNotifiable,
  toClubDate,
} from '../policies/medical.policy';
import { MedicalCheckupsService } from '../shared/medical-checkups.service';
import type {
  CareScheduleDueEvent,
  CheckupOverdueEvent,
} from '../types/medical-events.types';

@Injectable()
export class MedicalRemindersService {
  private readonly logger = new Logger(MedicalRemindersService.name);

  constructor(
    private readonly checkups: MedicalCheckupsService,
    private readonly events: DomainEventPublisher,
  ) {}

  /**
   * Job hằng ngày 07:00 giờ Việt Nam: chạy các nhắc nhở y tế định kỳ
   *
   * - Mỗi loại nhắc chạy độc lập: loại này lỗi vẫn chạy loại kia
   * - Lỗi chỉ được log, không làm dừng scheduler
   *
   * @returns Promise hoàn tất khi đã chạy xong
   */
  @Cron('0 7 * * *', {
    name: 'medical-daily-reminders',
    timeZone: CLUB_TIME_ZONE,
  })
  async runDaily(): Promise<void> {
    const today = toClubDate(new Date());
    const overdue = await this.runSafely('nhắc quá hạn khám định kỳ', () =>
      this.notifyOverdueCheckups(today),
    );
    const due = await this.runSafely('nhắc lịch chăm sóc đến hạn', () =>
      this.notifyDueCareSchedules(today),
    );
    this.logger.log(
      `Nhắc quá hạn khám định kỳ: ${overdue ?? 'lỗi'}; nhắc lịch chăm sóc đến hạn: ${due ?? 'lỗi'}`,
    );
  }

  /**
   * Chạy một loại nhắc, lỗi thì log và trả null để loại khác vẫn chạy tiếp
   *
   * @param label Tên loại nhắc dùng trong log
   * @param run Hàm chạy loại nhắc, trả về số nhắc đã phát
   * @returns Promise trả về số nhắc đã phát, hoặc null nếu loại nhắc này lỗi
   */
  private async runSafely(
    label: string,
    run: () => Promise<number>,
  ): Promise<number | null> {
    try {
      return await run();
    } catch (error) {
      this.logger.error(
        `Chạy ${label} thất bại`,
        error instanceof Error ? error.stack : String(error),
      );
      return null;
    }
  }

  /**
   * Phát nhắc cho mọi con ngựa quá hạn khám định kỳ trên CHECKUP_OVERDUE_NOTIFY_DAYS ngày
   *
   * - eventId cố định theo ngựa và hạn khám: chạy lại cùng ngày hay các ngày sau đều không báo trùng
   * - Khám xong thì hạn đổi nên eventId đổi, có thể báo lại khi hạn mới quá
   *
   * @param today Hôm nay theo lịch câu lạc bộ
   * @returns Promise trả về số con ngựa đã phát nhắc
   */
  async notifyOverdueCheckups(today: string): Promise<number> {
    const rows = await this.checkups.herdCheckupAnchors();
    let sent = 0;
    for (const row of rows) {
      const dueDate = checkupDueDate(row);
      if (!isOverdueNotifiable(dueDate, today)) continue;
      const event: CheckupOverdueEvent = {
        eventId: deterministicUuid(`checkup-overdue:${row.horseId}:${dueDate}`),
        horseId: row.horseId,
        dueDate,
      };
      this.events.publish(MEDICAL_CHECKUP_OVERDUE_EVENT, event);
      sent += 1;
    }
    return sent;
  }

  /**
   * Phát nhắc cho mọi lịch tiêm phòng, tẩy giun, kiểm tra móng đến hạn hôm nay hoặc trước đó mà chưa làm
   *
   * - eventId cố định theo lịch và ngày đến hạn: mỗi lịch chỉ báo một lần; dời ngày thì được báo lại theo ngày mới
   *
   * @param today Hôm nay theo lịch câu lạc bộ
   * @returns Promise trả về số lịch đã phát nhắc
   */
  async notifyDueCareSchedules(today: string): Promise<number> {
    const rows = await this.checkups.dueCareSchedules(today);
    for (const row of rows) {
      const event: CareScheduleDueEvent = {
        eventId: deterministicUuid(
          `care-schedule-due:${row.scheduleId}:${row.dueDate}`,
        ),
        horseId: row.horseId,
        scheduleId: row.scheduleId,
        type: row.type,
        dueDate: row.dueDate,
        assigneeId: row.assignedTo,
      };
      this.events.publish(MEDICAL_CARE_SCHEDULE_DUE_EVENT, event);
    }
    return rows.length;
  }
}

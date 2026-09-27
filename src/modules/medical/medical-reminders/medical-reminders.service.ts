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
import { MedicalSharedRepository } from '../shared/medical-shared.repository';
import type {
  CareScheduleDueEvent,
  CheckupOverdueEvent,
} from '../types/medical-events.types';

@Injectable()
export class MedicalRemindersService {
  private readonly logger = new Logger(MedicalRemindersService.name);

  constructor(
    private readonly shared: MedicalSharedRepository,
    private readonly events: DomainEventPublisher,
  ) {}

  /**
   * Job hằng ngày 07:00 giờ Việt Nam: chạy các nhắc nhở y tế định kỳ
   *
   * - Lỗi chỉ được log, không làm dừng scheduler
   *
   * @returns A promise resolving khi đã chạy xong
   */
  @Cron('0 7 * * *', {
    name: 'medical-daily-reminders',
    timeZone: CLUB_TIME_ZONE,
  })
  async runDaily(): Promise<void> {
    try {
      const today = toClubDate(new Date());
      const overdue = await this.notifyOverdueCheckups(today);
      const due = await this.notifyDueCareSchedules(today);
      this.logger.log(
        `Đã phát ${overdue} nhắc quá hạn khám định kỳ, ${due} nhắc lịch chăm sóc đến hạn`,
      );
    } catch (error) {
      this.logger.error(
        'Chạy nhắc nhở y tế hằng ngày thất bại',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  /**
   * Phát nhắc cho mọi con ngựa quá hạn khám định kỳ trên 7 ngày (F3.2 mục 5, Flow 3 mục III.7)
   *
   * - eventId cố định theo ngựa và hạn khám: chạy lại cùng ngày hay các ngày sau đều không báo trùng
   * - Khám xong thì hạn đổi nên eventId đổi, có thể báo lại khi hạn mới quá
   *
   * @param today Hôm nay theo lịch câu lạc bộ
   * @returns A promise resolving to số con ngựa đã phát nhắc
   */
  async notifyOverdueCheckups(today: string): Promise<number> {
    const rows = await this.shared.herdCheckupAnchors();
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
   * Phát nhắc cho mọi lịch tiêm phòng, tẩy giun, kiểm tra móng đến hạn hôm nay hoặc trước đó mà chưa làm (F3.11 mục 5)
   *
   * - eventId cố định theo lịch và ngày đến hạn: mỗi lịch chỉ báo một lần; dời ngày thì được báo lại theo ngày mới
   *
   * @param today Hôm nay theo lịch câu lạc bộ
   * @returns A promise resolving to số lịch đã phát nhắc
   */
  async notifyDueCareSchedules(today: string): Promise<number> {
    const rows = await this.shared.dueCareSchedules(today);
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

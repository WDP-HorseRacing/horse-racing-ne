import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { DataSource } from 'typeorm';
import { DomainEventPublisher } from '../../../common/infrastructure/events/domain-event.publisher';
import { deterministicUuid } from '../../../common/utils/deterministic-uuid';
import { CLUB_TIME_ZONE } from '../../../common/constants';
import {
  MEDICAL_CARE_SCHEDULE_DUE_EVENT,
  MEDICAL_CHECKUP_APPOINTMENT_DUE_EVENT,
  MEDICAL_CHECKUP_DUE_EVENT,
  MEDICAL_CHECKUP_OVERDUE_EVENT,
} from '../constants/medical-events.constants';
import { CheckupDueStatus } from '../constants/checkup.enum';
import {
  checkupDueDate,
  dueStatusOf,
  isOverdueNotifiable,
} from '../policies/medical.policy';
import { toClubDate } from '../../../common/utils/club-date';
import { MedicalCheckupsService } from '../shared/medical-checkups.service';
import type {
  CareScheduleDueEvent,
  CheckupAppointmentDueEvent,
  CheckupDueEvent,
  CheckupOverdueEvent,
} from '../types/medical-events.types';

@Injectable()
export class MedicalRemindersService {
  private readonly logger = new Logger(MedicalRemindersService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly checkups: MedicalCheckupsService,
    private readonly events: DomainEventPublisher,
  ) {}

  /**
   * Job hằng ngày 05:00 giờ Việt Nam: chạy các nhắc nhở y tế định kỳ
   *
   * - Mỗi loại nhắc chạy độc lập: loại này lỗi vẫn chạy loại kia
   * - Lỗi chỉ được log, không làm dừng scheduler
   *
   * @returns Promise hoàn tất khi đã chạy xong
   */
  @Cron('0 5 * * *', {
    name: 'medical-daily-reminders',
    timeZone: CLUB_TIME_ZONE,
  })
  async runDaily(): Promise<void> {
    const today = toClubDate(new Date());
    const dueCheckups = await this.runSafely('nhắc đến hạn khám định kỳ', () =>
      this.notifyDueCheckups(today),
    );
    const overdue = await this.runSafely('nhắc quá hạn khám định kỳ', () =>
      this.notifyOverdueCheckups(today),
    );
    const due = await this.runSafely('nhắc lịch chăm sóc đến hạn', () =>
      this.notifyDueCareSchedules(today),
    );
    const appointments = await this.runSafely('nhắc ngày hẹn khám', () =>
      this.notifyDueAppointments(today),
    );
    this.logger.log(
      `Nhắc đến hạn khám định kỳ: ${dueCheckups ?? 'lỗi'}; nhắc quá hạn khám định kỳ: ${overdue ?? 'lỗi'}; nhắc lịch chăm sóc đến hạn: ${due ?? 'lỗi'}; nhắc ngày hẹn khám: ${appointments ?? 'lỗi'}`,
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
   * Phát nhắc cho mọi con ngựa đang ở trạng thái đến hạn khám định kỳ (DUE_SOON) mà chưa có ngày hẹn khám
   *
   * - Ngựa đang có ngày hẹn khám còn hiệu lực thì bỏ qua
   * - eventId cố định theo ngựa và hạn khám: mỗi hạn chỉ báo một lần dù job chạy nhiều ngày liền
   *
   * @param today Hôm nay theo lịch câu lạc bộ
   * @returns Promise trả về số con ngựa đã phát nhắc
   */
  async notifyDueCheckups(today: string): Promise<number> {
    const rows = (await this.checkups.herdCheckupAnchors()).filter(
      (row) =>
        dueStatusOf(checkupDueDate(row), today) === CheckupDueStatus.DUE_SOON,
    );
    const appointments = await this.checkups.activeAppointments(
      rows.map((row) => row.horseId),
    );
    let sent = 0;
    for (const row of rows) {
      if (appointments.has(row.horseId)) continue;
      const dueDate = checkupDueDate(row);
      const event: CheckupDueEvent = {
        eventId: deterministicUuid(`checkup-due:${row.horseId}:${dueDate}`),
        horseId: row.horseId,
        dueDate,
      };
      await this.events.publish(
        this.dataSource.manager,
        MEDICAL_CHECKUP_DUE_EVENT,
        event,
      );
      sent += 1;
    }
    return sent;
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
      await this.events.publish(
        this.dataSource.manager,
        MEDICAL_CHECKUP_OVERDUE_EVENT,
        event,
      );
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
      await this.events.publish(
        this.dataSource.manager,
        MEDICAL_CARE_SCHEDULE_DUE_EVENT,
        event,
      );
    }
    return rows.length;
  }

  /**
   * Phát nhắc cho mọi ngày hẹn khám định kỳ và lịch tái khám tới ngày hẹn hôm nay hoặc đã qua mà chưa khám
   *
   * - eventId cố định theo ngày hẹn và ngày hẹn theo lịch câu lạc bộ: mỗi ngày hẹn chỉ báo một lần; dời sang ngày khác thì được báo lại theo ngày mới
   *
   * @param today Hôm nay theo lịch câu lạc bộ
   * @returns Promise trả về số ngày hẹn đã phát nhắc
   */
  async notifyDueAppointments(today: string): Promise<number> {
    const appointments = await this.checkups.dueAppointments(today);
    for (const appointment of appointments) {
      const event: CheckupAppointmentDueEvent = {
        eventId: deterministicUuid(
          `checkup-appointment-due:${appointment.id}:${toClubDate(appointment.dueAt)}`,
        ),
        horseId: appointment.horseId,
        appointmentId: appointment.id,
        type: appointment.type,
        scheduledAt: appointment.dueAt.toISOString(),
      };
      await this.events.publish(
        this.dataSource.manager,
        MEDICAL_CHECKUP_APPOINTMENT_DUE_EVENT,
        event,
      );
    }
    return appointments.length;
  }
}

import { Injectable, Logger } from '@nestjs/common';
import { UserRole } from '../../../common/enums/role.enum';
import { CLUB_TIME_ZONE } from '../../horses/constants/horse.constants';
import { HorseHealthStatus } from '../../horses/enums/horse-status.enum';
import { CareScheduleType } from '../../medical/constants/care-schedule.enum';
import type {
  CareScheduleDueEvent,
  CheckupOverdueEvent,
  ExamRequestUrgentEvent,
  HealthChangedEvent,
  MedicalCaseCancelledEvent,
  MedicalCaseClosedEvent,
  MedicalCaseCostAdjustedEvent,
  MedicalCaseOpenedEvent,
  TrainingLockReleasedEvent,
  TrainingLockSetEvent,
} from '../../medical/types/medical-events.types';
import { NotificationPriority } from '../constants/notification-priority.enum';
import { NotificationType } from '../constants/notification-type.enum';
import { NotificationRecipientsRepository } from '../repositories/notification-recipients.repository';
import type { HorseMedicalContact } from '../types/notification.types';
import { NotificationsService } from './notifications.service';

/**
 * Nhóm người nhận của một thông báo y tế (Flow 3 mục III.7).
 */
interface MedicalAudience {
  veterinarians?: boolean;
  clubManagers?: boolean;
  headTrainer?: boolean;
  owner?: boolean;
  extraUserIds?: Array<string | null>;
}

/**
 * Tên tiếng Việt của loại lịch chăm sóc, dùng trong nội dung thông báo.
 */
const CARE_SCHEDULE_LABELS: Record<CareScheduleType, string> = {
  [CareScheduleType.VACCINATION]: 'tiêm phòng',
  [CareScheduleType.DEWORMING]: 'tẩy giun',
  [CareScheduleType.FARRIER]: 'kiểm tra móng',
  [CareScheduleType.ROUTINE_CHECKUP]: 'khám định kỳ',
};

/**
 * Tên tiếng Việt của trạng thái sức khỏe, dùng trong nội dung thông báo.
 */
const HEALTH_LABELS: Record<HorseHealthStatus, string> = {
  [HorseHealthStatus.ELIGIBLE]: 'Đủ điều kiện',
  [HorseHealthStatus.UNDER_OBSERVATION]: 'Cần theo dõi',
  [HorseHealthStatus.INJURED]: 'Chấn thương',
  [HorseHealthStatus.QUARANTINED]: 'Cách ly',
};

@Injectable()
export class MedicalNotificationsService {
  private readonly logger = new Logger(MedicalNotificationsService.name);

  constructor(
    private readonly recipients: NotificationRecipientsRepository,
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * Báo mọi Veterinarian khi có yêu cầu khám mức Khẩn do người dùng tạo (F3.4 mục 6)
   *
   * @param event Payload của MEDICAL_EXAM_REQUEST_URGENT_EVENT
   * @returns A promise resolving to id những người nhận vừa được lưu mới
   */
  notifyUrgentExamRequest(event: ExamRequestUrgentEvent): Promise<string[]> {
    return this.sendForHorse(
      event.eventId,
      event.horseId,
      { veterinarians: true },
      NotificationType.WARNING,
      NotificationPriority.URGENT,
      (horse) => ({
        title: `KHẨN: Yêu cầu khám ngựa ${horse}`,
        message: `Có yêu cầu khám khẩn cho ngựa ${horse}: ${event.description}`,
      }),
    );
  }

  /**
   * Báo Head Trainer của khu và Club Manager khi bác sĩ đặt khóa huấn luyện (F3.8 mục 8)
   *
   * @param event Payload của MEDICAL_TRAINING_LOCK_SET_EVENT
   * @returns A promise resolving to id những người nhận vừa được lưu mới
   */
  notifyLockSet(event: TrainingLockSetEvent): Promise<string[]> {
    const until = event.expectedEnd
      ? ` Dự kiến gỡ: ${formatClubDate(event.expectedEnd)}.`
      : '';
    return this.sendForHorse(
      event.eventId,
      event.horseId,
      { headTrainer: true, clubManagers: true },
      NotificationType.WARNING,
      NotificationPriority.HIGH,
      (horse) => ({
        title: `Ngựa ${horse} bị khóa huấn luyện`,
        message: `Bác sĩ đã khóa huấn luyện ngựa ${horse}: ${event.reason}.${until} Ngựa không được tập và không được đua cho tới khi gỡ khóa.`,
      }),
    );
  }

  /**
   * Báo Head Trainer của khu và Club Manager khi bác sĩ gỡ khóa huấn luyện (F3.8 mục 8)
   *
   * @param event Payload của MEDICAL_TRAINING_LOCK_RELEASED_EVENT
   * @returns A promise resolving to id những người nhận vừa được lưu mới
   */
  notifyLockReleased(event: TrainingLockReleasedEvent): Promise<string[]> {
    return this.sendForHorse(
      event.eventId,
      event.horseId,
      { headTrainer: true, clubManagers: true },
      NotificationType.INFO,
      NotificationPriority.NORMAL,
      (horse) => ({
        title: `Ngựa ${horse} được gỡ khóa huấn luyện`,
        message: `Bác sĩ đã gỡ khóa huấn luyện ngựa ${horse}: ${event.conclusion}.`,
      }),
    );
  }

  /**
   * Báo Head Trainer của khu, Club Manager và chủ ngựa khi ngựa chuyển sang Chấn thương hoặc Cách ly (F3.7 mục 3)
   *
   * - Đổi sang trạng thái khác không gửi gì
   *
   * @param event Payload của MEDICAL_HEALTH_CHANGED_EVENT
   * @returns A promise resolving to id những người nhận vừa được lưu mới, rỗng nếu không cần báo
   */
  async notifyHealthChanged(event: HealthChangedEvent): Promise<string[]> {
    if (
      event.to !== HorseHealthStatus.INJURED &&
      event.to !== HorseHealthStatus.QUARANTINED
    ) {
      return [];
    }
    return this.sendForHorse(
      event.eventId,
      event.horseId,
      { headTrainer: true, clubManagers: true, owner: true },
      NotificationType.WARNING,
      NotificationPriority.HIGH,
      (horse) => ({
        title: `Ngựa ${horse}: ${HEALTH_LABELS[event.to]}`,
        message: `Trạng thái sức khỏe của ngựa ${horse} chuyển từ ${HEALTH_LABELS[event.from]} sang ${HEALTH_LABELS[event.to]}. Ngựa không được tập và không được đua.`,
      }),
    );
  }

  /**
   * Báo Club Manager và chủ ngựa khi bệnh án được mở (F3.5 mục 6)
   *
   * @param event Payload của MEDICAL_CASE_OPENED_EVENT
   * @returns A promise resolving to id những người nhận vừa được lưu mới
   */
  notifyCaseOpened(event: MedicalCaseOpenedEvent): Promise<string[]> {
    return this.sendForHorse(
      event.eventId,
      event.horseId,
      { clubManagers: true, owner: true },
      NotificationType.INFO,
      NotificationPriority.NORMAL,
      (horse) => ({
        title: `Mở bệnh án cho ngựa ${horse}`,
        message: `Bác sĩ đã mở bệnh án cho ngựa ${horse}. Chẩn đoán ban đầu: ${event.initialDiagnosis}.`,
      }),
    );
  }

  /**
   * Báo Club Manager và chủ ngựa khi bệnh án mở nhầm bị hủy, vì họ đã nhận thông báo mở bệnh án (F3.6 mục 8)
   *
   * @param event Payload của MEDICAL_CASE_CANCELLED_EVENT
   * @returns A promise resolving to id những người nhận vừa được lưu mới
   */
  notifyCaseCancelled(event: MedicalCaseCancelledEvent): Promise<string[]> {
    return this.sendForHorse(
      event.eventId,
      event.horseId,
      { clubManagers: true, owner: true },
      NotificationType.INFO,
      NotificationPriority.NORMAL,
      (horse) => ({
        title: `Hủy bệnh án ngựa ${horse}`,
        message: `Bệnh án của ngựa ${horse} đã bị hủy vì mở nhầm: ${event.reason}.`,
      }),
    );
  }

  /**
   * Báo chủ ngựa và Club Manager khi bệnh án đóng, kèm chi phí chốt (F3.9 mục 10)
   *
   * @param event Payload của MEDICAL_CASE_CLOSED_EVENT
   * @returns A promise resolving to id những người nhận vừa được lưu mới
   */
  notifyCaseClosed(event: MedicalCaseClosedEvent): Promise<string[]> {
    return this.sendForHorse(
      event.eventId,
      event.horseId,
      { clubManagers: true, owner: true },
      NotificationType.INFO,
      NotificationPriority.NORMAL,
      (horse) => ({
        title: `Đóng bệnh án ngựa ${horse}`,
        message: `Bệnh án của ngựa ${horse} đã đóng. Tổng chi phí điều trị: ${formatVnd(event.totalCost)}.`,
      }),
    );
  }

  /**
   * Báo chủ ngựa và Club Manager khi chi phí bệnh án đã đóng được điều chỉnh (F3.9 mục 8)
   *
   * @param event Payload của MEDICAL_CASE_COST_ADJUSTED_EVENT
   * @returns A promise resolving to id những người nhận vừa được lưu mới
   */
  notifyCaseCostAdjusted(
    event: MedicalCaseCostAdjustedEvent,
  ): Promise<string[]> {
    return this.sendForHorse(
      event.eventId,
      event.horseId,
      { clubManagers: true, owner: true },
      NotificationType.INFO,
      NotificationPriority.NORMAL,
      (horse) => ({
        title: `Điều chỉnh chi phí bệnh án ngựa ${horse}`,
        message: `Chi phí bệnh án của ngựa ${horse} được điều chỉnh từ ${formatVnd(event.fromCost)} thành ${formatVnd(event.toCost)}.`,
      }),
    );
  }

  /**
   * Báo mọi Veterinarian và Club Manager khi ngựa quá hạn khám định kỳ trên số ngày ngưỡng (F3.2 mục 6)
   *
   * @param event Payload của MEDICAL_CHECKUP_OVERDUE_EVENT
   * @returns A promise resolving to id những người nhận vừa được lưu mới
   */
  notifyCheckupOverdue(event: CheckupOverdueEvent): Promise<string[]> {
    return this.sendForHorse(
      event.eventId,
      event.horseId,
      { veterinarians: true, clubManagers: true },
      NotificationType.WARNING,
      NotificationPriority.HIGH,
      (horse) => ({
        title: `Ngựa ${horse} quá hạn khám định kỳ`,
        message: `Ngựa ${horse} đã quá hạn khám định kỳ (hạn ${event.dueDate}). Vui lòng đặt lịch khám.`,
      }),
    );
  }

  /**
   * Báo mọi Veterinarian và người được giao khi lịch chăm sóc định kỳ đến hạn (F3.11 mục 5)
   *
   * @param event Payload của MEDICAL_CARE_SCHEDULE_DUE_EVENT
   * @returns A promise resolving to id những người nhận vừa được lưu mới
   */
  notifyCareScheduleDue(event: CareScheduleDueEvent): Promise<string[]> {
    return this.sendForHorse(
      event.eventId,
      event.horseId,
      { veterinarians: true, extraUserIds: [event.assigneeId] },
      NotificationType.INFO,
      NotificationPriority.NORMAL,
      (horse) => ({
        title: `Đến hạn ${CARE_SCHEDULE_LABELS[event.type]} cho ngựa ${horse}`,
        message: `Ngựa ${horse} đến hạn ${CARE_SCHEDULE_LABELS[event.type]} ngày ${event.dueDate}.`,
      }),
    );
  }

  /**
   * Gom người nhận theo nhóm rồi gửi một thông báo về một con ngựa
   *
   * - Người nhận trùng nhau chỉ nhận một lần; không có ai để báo thì không gửi
   * - Không tìm thấy ngựa thì log cảnh báo và bỏ qua
   *
   * @param eventId Khóa chống gửi trùng
   * @param horseId UUID của ngựa
   * @param audience Các nhóm người nhận
   * @param type Loại thông báo
   * @param priority Mức ưu tiên
   * @param describe Hàm soạn tiêu đề và nội dung từ tên ngựa
   * @returns A promise resolving to id những người nhận vừa được lưu mới
   */
  private async sendForHorse(
    eventId: string,
    horseId: string,
    audience: MedicalAudience,
    type: NotificationType,
    priority: NotificationPriority,
    describe: (horseName: string) => { title: string; message: string },
  ): Promise<string[]> {
    const contact = await this.recipients.findHorseMedicalContact(horseId);
    if (!contact) {
      this.logger.warn(
        `Bỏ qua thông báo y tế ${eventId}: không tìm thấy ngựa ${horseId}`,
      );
      return [];
    }
    const recipientIds = await this.resolveAudience(audience, contact);
    if (recipientIds.length === 0) {
      return [];
    }
    return this.notifications.send({
      eventId,
      recipientIds,
      type,
      priority,
      ...describe(contact.horseName),
    });
  }

  /**
   * Đổi nhóm người nhận thành danh sách id không trùng
   *
   * @param audience Các nhóm người nhận
   * @param contact Head Trainer và chủ của con ngựa
   * @returns A promise resolving to danh sách id người nhận
   */
  private async resolveAudience(
    audience: MedicalAudience,
    contact: HorseMedicalContact,
  ): Promise<string[]> {
    const ids: Array<string | null> = [...(audience.extraUserIds ?? [])];
    if (audience.veterinarians) {
      ids.push(
        ...(await this.recipients.findActiveUserIdsByRole(
          UserRole.VETERINARIAN,
        )),
      );
    }
    if (audience.clubManagers) {
      ids.push(
        ...(await this.recipients.findActiveUserIdsByRole(
          UserRole.CLUB_MANAGER,
        )),
      );
    }
    if (audience.headTrainer) ids.push(contact.headTrainerId);
    if (audience.owner) ids.push(contact.ownerId);
    return [...new Set(ids.filter((id): id is string => id !== null))];
  }
}

/**
 * Định dạng ngày theo lịch câu lạc bộ (Asia/Ho_Chi_Minh), dạng YYYY-MM-DD
 *
 * @param date Thời điểm cần hiển thị
 * @returns Ngày theo giờ Việt Nam
 */
function formatClubDate(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: CLUB_TIME_ZONE }).format(
    new Date(date),
  );
}

/**
 * Định dạng số tiền VND có dấu phân cách hàng nghìn, ví dụ 1.500.000 đ
 *
 * @param amount Số tiền VND
 * @returns Chuỗi hiển thị
 */
function formatVnd(amount: number): string {
  return `${new Intl.NumberFormat('vi-VN').format(amount)} đ`;
}

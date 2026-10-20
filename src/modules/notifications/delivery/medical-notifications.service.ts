import { Injectable, Logger } from '@nestjs/common';
import { UserRole } from '../../../common/enums/role.enum';
import {
  formatClubDateTime,
  toClubDate,
  toDisplayDate,
} from '../../../common/utils/club-date';
import { HorseHealthStatus } from '../../horses/enums/horse-status.enum';
import { CareScheduleType } from '../../medical/constants/care-schedule.enum';
import { ExamRequestStatus } from '../../medical/constants/exam-request.enum';
import type {
  CareScheduleDueEvent,
  CheckupAppointmentDueEvent,
  CheckupDueEvent,
  CheckupOverdueEvent,
  ExamRequestHandledEvent,
  ExamRequestUrgentEvent,
  ExposedHorse,
  HealthChangedEvent,
  MedicalCaseCancelledEvent,
  MedicalCaseClosedEvent,
  MedicalVisitCostAdjustedEvent,
  MedicalCaseOpenedEvent,
  TrainingLockReleasedEvent,
  TrainingLockSetEvent,
} from '../../medical/types/medical-events.types';
import { NotificationPriority } from '../enums/notification-priority.enum';
import { NotificationResourceType } from '../enums/notification-resource-type.enum';
import { NotificationCategory } from '../enums/notification-category.enum';
import { NotificationRecipientsRepository } from './notification-recipients.repository';
import type { HorseMedicalContact } from '../types/notification.types';
import type { NotificationResource } from '../schemas/notification.schema';
import { horseResource } from '../mappers/notification.mapper';
import { NotificationDeliveryService } from './notification-delivery.service';

/**
 * Event y tế mà thông báo dựa vào.
 *
 * - ownerId: chủ của ngựa lúc phát event; undefined khi event không mang trường này, kể cả payload cũ ghi vào outbox trước khi có trường
 */
interface MedicalEventRef {
  eventId: string;
  horseId: string;
  ownerId?: string | null;
}

/**
 * Nhóm người nhận của một thông báo y tế.
 *
 * - owner: chủ của ngựa lúc phát event (MedicalEventRef.ownerId), không phải chủ lúc giao
 */
interface MedicalAudience {
  veterinarians?: boolean;
  clubManagers?: boolean;
  headTrainer?: boolean;
  owner?: boolean;
  groom?: boolean;
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
  [CareScheduleType.FOLLOW_UP]: 'tái khám',
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

/**
 * Số ngựa tiếp xúc tối đa ghi tên trong thông báo Cách ly, phần còn lại gộp thành "và N con khác".
 */
const EXPOSED_HORSES_SHOWN = 10;

@Injectable()
export class MedicalNotificationsService {
  private readonly logger = new Logger(MedicalNotificationsService.name);

  constructor(
    private readonly recipients: NotificationRecipientsRepository,
    private readonly notifications: NotificationDeliveryService,
  ) {}

  /**
   * Báo mọi Veterinarian khi có yêu cầu khám mức Khẩn do người dùng tạo
   *
   * @param event Payload của MEDICAL_EXAM_REQUEST_URGENT_EVENT
   * @returns Promise trả về id những người nhận vừa được lưu mới
   */
  notifyUrgentExamRequest(event: ExamRequestUrgentEvent): Promise<string[]> {
    return this.sendForHorse(
      event,
      horseResource(event.horseId),
      { veterinarians: true },
      NotificationCategory.EXAM_REQUEST,
      NotificationPriority.URGENT,
      (horse) => ({
        title: `KHẨN: Yêu cầu khám ngựa ${horse}`,
        message: `Có yêu cầu khám khẩn cho ngựa ${horse}: ${event.description}`,
      }),
    );
  }

  /**
   * Báo người gửi yêu cầu khám khi bác sĩ khám xong hoặc bỏ qua yêu cầu
   *
   * - Bỏ qua: kèm lý do trong nội dung
   *
   * @param event Payload của MEDICAL_EXAM_REQUEST_HANDLED_EVENT
   * @returns Promise trả về id những người nhận vừa được lưu mới
   */
  notifyExamRequestHandled(event: ExamRequestHandledEvent): Promise<string[]> {
    const examined = event.outcome === ExamRequestStatus.EXAMINED;
    return this.sendForHorse(
      event,
      horseResource(event.horseId),
      { extraUserIds: [event.requestedBy] },
      NotificationCategory.EXAM_REQUEST,
      NotificationPriority.NORMAL,
      (horse) =>
        examined
          ? {
              title: `Ngựa ${horse} đã được bác sĩ khám`,
              message: `Yêu cầu khám "${event.description}" của ngựa ${horse} đã được bác sĩ khám.`,
            }
          : {
              title: `Yêu cầu khám ngựa ${horse} được bỏ qua`,
              message: `Bác sĩ bỏ qua yêu cầu khám "${event.description}" của ngựa ${horse}. Lý do: ${event.dismissReason}`,
            },
    );
  }

  /**
   * Báo Head Trainer của khu, Club Manager, chủ ngựa và Groom phụ trách khi bác sĩ đặt khóa huấn luyện
   *
   * @param event Payload của MEDICAL_TRAINING_LOCK_SET_EVENT
   * @returns Promise trả về id những người nhận vừa được lưu mới
   */
  notifyLockSet(event: TrainingLockSetEvent): Promise<string[]> {
    const until = event.expectedEnd
      ? ` Dự kiến gỡ: ${toClubDate(event.expectedEnd)}.`
      : '';
    return this.sendForHorse(
      event,
      {
        type: NotificationResourceType.TRAINING_LOCK,
        id: event.lockId,
        horseId: event.horseId,
      },
      { headTrainer: true, clubManagers: true, owner: true, groom: true },
      NotificationCategory.TRAINING_LOCK,
      NotificationPriority.HIGH,
      (horse) => ({
        title: `Ngựa ${horse} bị khóa huấn luyện`,
        message: `Bác sĩ đã khóa huấn luyện ngựa ${horse}: ${event.reason}.${until} Ngựa không được tập và không được đua cho tới khi gỡ khóa.`,
      }),
    );
  }

  /**
   * Báo Head Trainer của khu, Club Manager, chủ ngựa và Groom phụ trách khi bác sĩ gỡ khóa huấn luyện
   *
   * @param event Payload của MEDICAL_TRAINING_LOCK_RELEASED_EVENT
   * @returns Promise trả về id những người nhận vừa được lưu mới
   */
  notifyLockReleased(event: TrainingLockReleasedEvent): Promise<string[]> {
    return this.sendForHorse(
      event,
      {
        type: NotificationResourceType.TRAINING_LOCK,
        id: event.lockId,
        horseId: event.horseId,
      },
      { headTrainer: true, clubManagers: true, owner: true, groom: true },
      NotificationCategory.TRAINING_LOCK,
      NotificationPriority.NORMAL,
      (horse) => ({
        title: `Ngựa ${horse} được gỡ khóa huấn luyện`,
        message: `Bác sĩ đã gỡ khóa huấn luyện ngựa ${horse}: ${event.conclusion}.`,
      }),
    );
  }

  /**
   * Báo khi trạng thái sức khỏe đổi
   *
   * - Sang Chấn thương hoặc Cách ly: báo Head Trainer của khu, Club Manager, chủ ngựa và Groom phụ trách, mức HIGH
   * - Sang Cách ly có ngựa có thể đã tiếp xúc: thông báo của Head Trainer, Club Manager và Groom kèm danh sách đó (tối đa EXPOSED_HORSES_SHOWN tên, còn lại ghi "và N con khác"); thông báo của chủ ngựa không kèm
   * - Sang Cần theo dõi: báo Head Trainer của khu, chủ ngựa và Groom phụ trách, mức NORMAL
   * - Về Đủ điều kiện: báo chủ ngựa và Groom phụ trách, mức NORMAL
   *
   * @param event Payload của MEDICAL_HEALTH_CHANGED_EVENT
   * @returns Promise trả về id những người nhận vừa được lưu mới, rỗng nếu không cần báo
   */
  async notifyHealthChanged(event: HealthChangedEvent): Promise<string[]> {
    if (event.to === HorseHealthStatus.UNDER_OBSERVATION) {
      return this.sendForHorse(
        event,
        horseResource(event.horseId),
        { headTrainer: true, owner: true, groom: true },
        NotificationCategory.HEALTH_STATUS,
        NotificationPriority.NORMAL,
        (horse) => ({
          title: `Ngựa ${horse}: ${HEALTH_LABELS[event.to]}`,
          message: `Trạng thái sức khỏe của ngựa ${horse} chuyển từ ${HEALTH_LABELS[event.from]} sang ${HEALTH_LABELS[event.to]}. Ngựa không được đua cho tới khi bác sĩ kết luận lại.`,
        }),
      );
    }
    if (event.to === HorseHealthStatus.ELIGIBLE) {
      return this.sendForHorse(
        event,
        horseResource(event.horseId),
        { owner: true, groom: true },
        NotificationCategory.HEALTH_STATUS,
        NotificationPriority.NORMAL,
        (horse) => ({
          title: `Ngựa ${horse}: ${HEALTH_LABELS[event.to]}`,
          message: `Trạng thái sức khỏe của ngựa ${horse} chuyển từ ${HEALTH_LABELS[event.from]} sang ${HEALTH_LABELS[event.to]}. Ngựa tập và đua lại được.`,
        }),
      );
    }
    const describe = (horse: string) => ({
      title: `Ngựa ${horse}: ${HEALTH_LABELS[event.to]}`,
      message: `Trạng thái sức khỏe của ngựa ${horse} chuyển từ ${HEALTH_LABELS[event.from]} sang ${HEALTH_LABELS[event.to]}. Ngựa không được tập và không được đua.`,
    });
    const exposed =
      event.to === HorseHealthStatus.QUARANTINED
        ? (event.exposedHorses ?? [])
        : [];
    if (exposed.length === 0) {
      return this.sendForHorse(
        event,
        horseResource(event.horseId),
        { headTrainer: true, clubManagers: true, owner: true, groom: true },
        NotificationCategory.HEALTH_STATUS,
        NotificationPriority.HIGH,
        describe,
      );
    }
    const staff = await this.sendForHorse(
      event,
      horseResource(event.horseId),
      { headTrainer: true, clubManagers: true, groom: true },
      NotificationCategory.HEALTH_STATUS,
      NotificationPriority.HIGH,
      (horse) => {
        const base = describe(horse);
        return {
          ...base,
          message: `${base.message} ${describeExposedHorses(exposed)}`,
        };
      },
    );
    const owner = await this.sendForHorse(
      event,
      horseResource(event.horseId),
      { owner: true },
      NotificationCategory.HEALTH_STATUS,
      NotificationPriority.HIGH,
      describe,
    );
    return [...staff, ...owner];
  }

  /**
   * Báo Club Manager và chủ ngựa khi bệnh án được mở
   *
   * @param event Payload của MEDICAL_CASE_OPENED_EVENT
   * @returns Promise trả về id những người nhận vừa được lưu mới
   */
  notifyCaseOpened(event: MedicalCaseOpenedEvent): Promise<string[]> {
    return this.sendForHorse(
      event,
      {
        type: NotificationResourceType.MEDICAL_CASE,
        id: event.caseId,
        horseId: event.horseId,
      },
      { clubManagers: true, owner: true },
      NotificationCategory.MEDICAL_CASE,
      NotificationPriority.NORMAL,
      (horse) => ({
        title: `Mở bệnh án cho ngựa ${horse}`,
        message: `Bác sĩ đã mở bệnh án cho ngựa ${horse}. Chẩn đoán ban đầu: ${event.initialDiagnosis}.`,
      }),
    );
  }

  /**
   * Báo Club Manager và chủ ngựa khi bệnh án mở nhầm bị hủy
   *
   * @param event Payload của MEDICAL_CASE_CANCELLED_EVENT
   * @returns Promise trả về id những người nhận vừa được lưu mới
   */
  notifyCaseCancelled(event: MedicalCaseCancelledEvent): Promise<string[]> {
    return this.sendForHorse(
      event,
      {
        type: NotificationResourceType.MEDICAL_CASE,
        id: event.caseId,
        horseId: event.horseId,
      },
      { clubManagers: true, owner: true },
      NotificationCategory.MEDICAL_CASE,
      NotificationPriority.NORMAL,
      (horse) => ({
        title: `Hủy bệnh án ngựa ${horse}`,
        message: `Bệnh án của ngựa ${horse} đã bị hủy vì mở nhầm: ${event.reason}.`,
      }),
    );
  }

  /**
   * Báo Club Manager và chủ ngựa khi bệnh án đóng, kèm chi phí chụp lúc đóng
   *
   * - Club Manager: tổng chi phí của cả bệnh án
   * - Chủ ngựa lúc đóng: chỉ phần chi phí thuộc giai đoạn mình sở hữu (event.ownerCost); lúc đóng ngựa không có chủ thì không báo chủ
   *
   * @param event Payload của MEDICAL_CASE_CLOSED_EVENT
   * @returns Promise trả về id những người nhận vừa được lưu mới
   */
  async notifyCaseClosed(event: MedicalCaseClosedEvent): Promise<string[]> {
    const resource = {
      type: NotificationResourceType.MEDICAL_CASE,
      id: event.caseId,
      horseId: event.horseId,
    };
    const toManagers = await this.sendForHorse(
      event,
      resource,
      { clubManagers: true },
      NotificationCategory.MEDICAL_CASE,
      NotificationPriority.NORMAL,
      (horse) => ({
        title: `Đóng bệnh án ngựa ${horse}`,
        message: `Bệnh án của ngựa ${horse} đã đóng. Tổng chi phí điều trị: ${formatVnd(event.totalCost)}.`,
      }),
    );
    if (event.ownerCost === null) return toManagers;
    const ownerCost = event.ownerCost;
    const toOwner = await this.sendForHorse(
      event,
      resource,
      { owner: true },
      NotificationCategory.MEDICAL_CASE,
      NotificationPriority.NORMAL,
      (horse) => ({
        title: `Đóng bệnh án ngựa ${horse}`,
        message: `Bệnh án của ngựa ${horse} đã đóng. Chi phí điều trị của bạn: ${formatVnd(ownerCost)}.`,
      }),
    );
    return [...toManagers, ...toOwner];
  }

  /**
   * Báo Club Manager và chủ chịu khoản chi phí khi chi phí của một buổi khám được điều chỉnh
   *
   * - Chủ chịu chi phí là chủ của giai đoạn sở hữu chứa ngày khám (event.costOwnerId), không phải chủ hiện tại
   * - Thông báo trỏ tới bệnh án chứa buổi khám; buổi khám ngoài bệnh án thì trỏ tới hồ sơ ngựa
   * - Chủ đó vẫn là chủ hiện tại: nhận cùng thông báo
   * - Chủ đó không còn là chủ hiện tại: nhận thông báo không trỏ tới đâu (resource null), chỉ khi còn là HORSE_OWNER đang ACTIVE
   * - Không tìm thấy ngựa thì log cảnh báo và bỏ qua
   *
   * @param event Payload của MEDICAL_VISIT_COST_ADJUSTED_EVENT
   * @returns Promise trả về id những người nhận vừa được lưu mới
   */
  notifyVisitCostAdjusted(
    event: MedicalVisitCostAdjustedEvent,
  ): Promise<string[]> {
    return this.sendForHorse(
      { ...event, ownerId: event.costOwnerId },
      event.caseId
        ? {
            type: NotificationResourceType.MEDICAL_CASE,
            id: event.caseId,
            horseId: event.horseId,
          }
        : horseResource(event.horseId),
      { clubManagers: true, owner: true },
      NotificationCategory.MEDICAL_CASE,
      NotificationPriority.NORMAL,
      (horse) => ({
        title: `Điều chỉnh chi phí khám ngựa ${horse}`,
        message: `Chi phí buổi khám ngày ${toDisplayDate(toClubDate(event.examDate))} của ngựa ${horse} được điều chỉnh từ ${formatVnd(event.fromCost)} thành ${formatVnd(event.toCost)}.`,
      }),
    );
  }

  /**
   * Báo mọi Veterinarian khi ngựa đến hạn khám định kỳ mà chưa có ngày hẹn khám
   *
   * @param event Payload của MEDICAL_CHECKUP_DUE_EVENT
   * @returns Promise trả về id những người nhận vừa được lưu mới
   */
  notifyCheckupDue(event: CheckupDueEvent): Promise<string[]> {
    return this.sendForHorse(
      event,
      horseResource(event.horseId),
      { veterinarians: true },
      NotificationCategory.CARE_REMINDER,
      NotificationPriority.NORMAL,
      (horse) => ({
        title: `Ngựa ${horse} đến hạn khám định kỳ`,
        message: `${horse} đến hạn khám định kỳ ngày ${toDisplayDate(event.dueDate)}. Vui lòng đặt lịch khám.`,
      }),
    );
  }

  /**
   * Báo mọi Veterinarian và Club Manager khi ngựa quá hạn khám định kỳ trên số ngày ngưỡng
   *
   * @param event Payload của MEDICAL_CHECKUP_OVERDUE_EVENT
   * @returns Promise trả về id những người nhận vừa được lưu mới
   */
  notifyCheckupOverdue(event: CheckupOverdueEvent): Promise<string[]> {
    return this.sendForHorse(
      event,
      horseResource(event.horseId),
      { veterinarians: true, clubManagers: true },
      NotificationCategory.CARE_REMINDER,
      NotificationPriority.HIGH,
      (horse) => ({
        title: `Ngựa ${horse} quá hạn khám định kỳ`,
        message: `Ngựa ${horse} đã quá hạn khám định kỳ (hạn ${event.dueDate}). Vui lòng đặt lịch khám.`,
      }),
    );
  }

  /**
   * Báo mọi Veterinarian và người được giao khi lịch chăm sóc định kỳ đến hạn
   *
   * @param event Payload của MEDICAL_CARE_SCHEDULE_DUE_EVENT
   * @returns Promise trả về id những người nhận vừa được lưu mới
   */
  notifyCareScheduleDue(event: CareScheduleDueEvent): Promise<string[]> {
    return this.sendForHorse(
      event,
      horseResource(event.horseId),
      { veterinarians: true, extraUserIds: [event.assigneeId] },
      NotificationCategory.CARE_REMINDER,
      NotificationPriority.NORMAL,
      (horse) => ({
        title: `Đến hạn ${CARE_SCHEDULE_LABELS[event.type]} cho ngựa ${horse}`,
        message: `Ngựa ${horse} đến hạn ${CARE_SCHEDULE_LABELS[event.type]} ngày ${event.dueDate}.`,
      }),
    );
  }

  /**
   * Báo mọi Veterinarian khi tới ngày hẹn khám định kỳ hoặc tái khám
   *
   * @param event Payload của MEDICAL_CHECKUP_APPOINTMENT_DUE_EVENT
   * @returns Promise trả về id những người nhận vừa được lưu mới
   */
  notifyCheckupAppointmentDue(
    event: CheckupAppointmentDueEvent,
  ): Promise<string[]> {
    return this.sendForHorse(
      event,
      horseResource(event.horseId),
      { veterinarians: true },
      NotificationCategory.CARE_REMINDER,
      NotificationPriority.NORMAL,
      (horse) => {
        const label =
          CARE_SCHEDULE_LABELS[event.type ?? CareScheduleType.ROUTINE_CHECKUP];
        return {
          title: `Lịch hẹn ${label} ngựa ${horse}`,
          message: `Ngựa ${horse} có lịch hẹn ${label} lúc ${formatClubDateTime(event.scheduledAt)}.`,
        };
      },
    );
  }

  /**
   * Gom người nhận theo nhóm rồi gửi một thông báo về một con ngựa
   *
   * - Người nhận trùng nhau chỉ nhận một lần; không có ai để báo thì không gửi
   * - Chủ ngựa là chủ lúc phát event (event.ownerId); payload cũ không có trường này thì lấy chủ hiện tại
   * - Chủ lúc phát event vẫn là chủ hiện tại: nhận cùng thông báo
   * - Chủ lúc phát event không còn là chủ hiện tại: nhận thông báo không trỏ tới đâu (resource null), chỉ khi còn là HORSE_OWNER đang ACTIVE; chủ hiện tại không nhận
   * - Không tìm thấy ngựa thì log cảnh báo và bỏ qua
   *
   * @param event Khóa chống gửi trùng, ngựa và chủ lúc phát event
   * @param resource Đối tượng mà thông báo trỏ tới
   * @param audience Các nhóm người nhận
   * @param category Loại nghiệp vụ của thông báo
   * @param priority Mức ưu tiên
   * @param describe Hàm soạn tiêu đề và nội dung từ tên ngựa
   * @returns Promise trả về id những người nhận vừa được lưu mới
   */
  private async sendForHorse(
    event: MedicalEventRef,
    resource: NotificationResource,
    audience: MedicalAudience,
    category: NotificationCategory,
    priority: NotificationPriority,
    describe: (horseName: string) => { title: string; message: string },
  ): Promise<string[]> {
    const contact = await this.recipients.findHorseMedicalContact(
      event.horseId,
    );
    if (!contact) {
      this.logger.warn(
        `Bỏ qua thông báo y tế ${event.eventId}: không tìm thấy ngựa ${event.horseId}`,
      );
      return [];
    }
    const ownerId = audience.owner
      ? event.ownerId === undefined
        ? contact.ownerId
        : event.ownerId
      : null;
    const ownerIsCurrent = ownerId !== null && ownerId === contact.ownerId;
    const draft = {
      eventId: event.eventId,
      category,
      priority,
      ...describe(contact.horseName),
    };
    const recipientIds = await this.resolveAudience(audience, {
      ...contact,
      ownerId: ownerIsCurrent ? ownerId : null,
    });
    const sent =
      recipientIds.length === 0
        ? []
        : await this.notifications.send({ ...draft, recipientIds, resource });
    if (
      ownerId === null ||
      ownerIsCurrent ||
      !(await this.recipients.isActiveUserWithRole(
        ownerId,
        UserRole.HORSE_OWNER,
      ))
    ) {
      return sent;
    }
    const toPastOwner = await this.notifications.send({
      ...draft,
      recipientIds: [ownerId],
      resource: null,
    });
    return [...sent, ...toPastOwner];
  }

  /**
   * Đổi nhóm người nhận thành danh sách id không trùng
   *
   * @param audience Các nhóm người nhận
   * @param contact Head Trainer, chủ cần báo kèm đường dẫn và Groom phụ trách của con ngựa
   * @returns Promise trả về danh sách id người nhận
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
    if (audience.groom) ids.push(contact.groomId);
    return [...new Set(ids.filter((id): id is string => !!id))];
  }
}

/**
 * Soạn câu liệt kê ngựa có thể đã tiếp xúc, kèm lý do cùng khu, cùng Groom hoặc cả hai
 *
 * - Ghi tên tối đa EXPOSED_HORSES_SHOWN con theo thứ tự nhận được, còn lại ghi "và N con khác"
 *
 * @param horses Các con ngựa có thể đã tiếp xúc, không rỗng
 * @returns Câu liệt kê để nối vào nội dung thông báo
 */
function describeExposedHorses(horses: ExposedHorse[]): string {
  const names = horses.slice(0, EXPOSED_HORSES_SHOWN).map((horse) => {
    const reasons = [
      ...(horse.sameBarn ? ['cùng khu'] : []),
      ...(horse.sameGroom ? ['cùng Groom'] : []),
    ];
    return `${horse.horseName} (${reasons.join(', ')})`;
  });
  const rest = horses.length - names.length;
  return `Ngựa có thể đã tiếp xúc: ${names.join(', ')}${rest > 0 ? ` và ${rest} con khác` : ''}.`;
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

import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import {
  formatClubDateTime,
  toClubDate,
  toDisplayDate,
} from '../../../../common/utils/club-date';
import { UserRole } from '../../../../common/enums/role.enum';
import {
  HorseMeasurementAlert,
  HorseMeasurementAlertSeverity,
} from '../../../horses/enums/horse-measurement-alert.enum';
import {
  HORSE_LIFECYCLE_LABELS,
  WEIGHT_DROP_WINDOW_DAYS,
} from '../../../horses/constants/horse.constants';
import { HorseLifecycleStatus } from '../../../horses/enums/horse-status.enum';
import { HorseEntity } from '../../../horses/entities/horse.entity';
import { formatMeasurement } from '../../../horses/utils/measurement-format';
import type {
  HorseBarnAssignedEvent,
  HorseDeceasedEvent,
  HorseGroomReleasedEvent,
  HorseLifecycleChangedEvent,
  HorseOwnershipTransferredEvent,
  HorseOwnerAssignedEvent,
  HorseMeasurementAlertEvent,
} from '../../../horses/types/horse.types';
import { HorseCareTaskMode } from '../../../stable/constants/horse-care-task-mode.enum';
import type {
  CareTaskChangedEvent,
  ChecklistGenerationFailedEvent,
  ChecklistGenerationRecoveredEvent,
  ChecklistTaskAddedEvent,
  GroomAssignmentChangedEvent,
  IncidentHandledEvent,
  IncidentReportedEvent,
  IncidentStaleEvent,
  StallHorseMovedEvent,
} from '../../../stable/types/stable-events.types';
import type { SurchargeAddedEvent } from '../../../billing/types/billing-events.types';
import type {
  TrainingRunGroomAssignedEvent,
  TrainingSessionCancelledEvent,
} from '../../../training/types/training-session.types';
import { NotificationPriority } from '../../enums/notification-priority.enum';
import { NotificationCategory } from '../../enums/notification-category.enum';
import { horseResource } from '../../mappers/notification.mapper';
import { NotificationRecipientsRepository } from '../shared/notification-recipients.repository';
import { NotificationDeliveryService } from '../shared/notification-delivery.service';

@Injectable()
export class HorseNotificationsService {
  private readonly logger = new Logger(HorseNotificationsService.name);

  constructor(
    private readonly recipients: NotificationRecipientsRepository,
    private readonly notifications: NotificationDeliveryService,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Gửi thông báo cho một cảnh báo chỉ số cơ thể.
   *
   * - Người nhận: mọi Veterinarian đang ACTIVE, Head Trainer đang ACTIVE phụ trách khu hiện tại của ngựa và chủ ngựa đang ACTIVE
   * - Ngựa chưa có khu (hoặc khu chưa có Head Trainer), hoặc chưa có chủ, thì bỏ người đó
   * - Mức ưu tiên lấy theo severity của event: URGENT → URGENT, WARNING → HIGH
   * - eventId của thông báo là event.eventId, payload không có eventId thì dùng measurementId: event phát lại không sinh thông báo trùng
   * - Không tìm thấy ngựa thì log cảnh báo và bỏ qua
   *
   * @param event Event cảnh báo số đo do module horses phát
   * @returns Promise trả về danh sách id người nhận vừa được lưu mới
   */
  async notifyMeasurementAlert(
    event: HorseMeasurementAlertEvent,
  ): Promise<string[]> {
    const horse = await this.recipients.findHorseMedicalContact(event.horseId);
    if (!horse) {
      this.logger.warn(
        `Bỏ qua cảnh báo ${event.alert} của bản ghi ${event.measurementId}: không tìm thấy ngựa ${event.horseId}`,
      );
      return [];
    }

    const recipientIds = await this.recipients.findActiveUserIdsByRole(
      UserRole.VETERINARIAN,
    );
    if (horse.headTrainerId) {
      recipientIds.push(horse.headTrainerId);
    }
    if (horse.ownerId) {
      recipientIds.push(horse.ownerId);
    }

    return this.notifications.send({
      eventId: event.eventId ?? event.measurementId,
      recipientIds,
      category: NotificationCategory.MEASUREMENT_ALERT,
      priority: toAlertPriority(event.severity),
      ...describeMeasurementAlert(horse.horseName, event),
      resource: horseResource(event.horseId),
    });
  }

  /**
   * Báo khi một con ngựa được xếp hoặc đổi vào khu: Head Trainer của khu mới, Groom đang phụ trách và Head Trainer của các lớp vừa bị rút
   *
   * - Ghi bằng connection riêng, không nhận EntityManager
   * - Head Trainer đang ACTIVE phụ trách khu mới: báo ngựa mới vào khu; khu chưa có Head Trainer thì bỏ
   * - Groom đang phụ trách ngựa: báo khu mới (chuyển khu khi có khu cũ, xếp khu lần đầu khi không) và ngựa đang chờ xếp ô; ngựa chưa có Groom thì bỏ
   * - Head Trainer của các lớp vừa bị rút: mỗi người một thông báo nêu các lớp của mình và lý do (theo notifyClassesWithdrawn)
   * - Idempotent theo notice.eventId: phát lại cùng event không sinh thông báo trùng
   * - Không tìm thấy ngựa hoặc khu (đã bị xóa) thì log cảnh báo và bỏ qua
   *
   * @param notice Payload của HORSE_BARN_ASSIGNED_EVENT: ngựa, khu mới, khu cũ, lý do, các lớp vừa bị rút và eventId chống trùng
   * @returns Promise trả về danh sách id người nhận vừa được lưu mới (rỗng nếu không có ai để báo)
   */
  async notifyBarnAssigned(notice: HorseBarnAssignedEvent): Promise<string[]> {
    const [horse, barn] = await Promise.all([
      this.recipients.findHorseMedicalContact(notice.horseId),
      this.recipients.findBarnContact(notice.barnId),
    ]);
    if (!horse || !barn) {
      this.logger.warn(
        `Bỏ qua thông báo xếp khu ${notice.eventId}: không tìm thấy ngựa ${notice.horseId} hoặc khu ${notice.barnId}`,
      );
      return [];
    }
    const horseName = horse.horseName;
    const moved = !!notice.fromBarnId;
    const toTrainer = barn.headTrainerId
      ? await this.notifications.send({
          eventId: notice.eventId,
          recipientIds: [barn.headTrainerId],
          category: NotificationCategory.BARN_ASSIGNED,
          priority: NotificationPriority.NORMAL,
          title: 'Ngựa mới vào khu phụ trách',
          message: `Ngựa ${horseName} vừa được xếp vào khu "${barn.barnName}". Vui lòng xếp ô chuồng và đăng ký lớp huấn luyện nếu cần.`,
          resource: horseResource(notice.horseId),
        })
      : [];
    const toGroom = horse.groomId
      ? await this.notifications.send({
          eventId: notice.eventId,
          recipientIds: [horse.groomId],
          category: NotificationCategory.BARN_ASSIGNED,
          priority: NotificationPriority.NORMAL,
          title: moved
            ? `Ngựa ${horseName} chuyển khu`
            : `Ngựa ${horseName} được xếp khu`,
          message: `Ngựa ${horseName} đã ${moved ? 'chuyển sang' : 'được xếp vào'} khu "${barn.barnName}", đang chờ xếp ô chuồng.`,
          resource: horseResource(notice.horseId),
        })
      : [];
    const toClasses = await this.notifyClassesWithdrawn(
      notice.eventId,
      horseName,
      notice.withdrawnClassIds,
      `${moved ? 'chuyển sang' : 'xếp vào'} khu "${barn.barnName}"${notice.reason ? `: ${notice.reason}` : ''}`,
      [barn.headTrainerId, horse.groomId],
    );
    return [...toTrainer, ...toGroom, ...toClasses];
  }

  /**
   * Báo Groom đang phụ trách ngựa khi Head Trainer xếp ngựa vào ô chuồng hoặc chuyển ô, kèm khu và ô mới
   *
   * - Ghi bằng connection riêng, không nhận EntityManager; idempotent theo notice.eventId
   * - Ngựa chưa có Groom, hoặc Groom chính là người chuyển ô thì không gửi
   * - Không tìm thấy ngựa hoặc khu thì không gửi
   *
   * @param notice Payload của STALL_HORSE_MOVED_EVENT
   * @returns Promise trả về id những người nhận vừa được lưu mới; không gửi thì trả mảng rỗng
   */
  async notifyStallMoved(notice: StallHorseMovedEvent): Promise<string[]> {
    const [horse, barn] = await Promise.all([
      this.recipients.findHorseMedicalContact(notice.horseId),
      this.recipients.findBarnContact(notice.barnId),
    ]);
    if (!horse?.groomId || !barn || horse.groomId === notice.movedBy) {
      return [];
    }
    return this.notifications.send({
      eventId: notice.eventId,
      recipientIds: [horse.groomId],
      category: NotificationCategory.BARN_ASSIGNED,
      priority: NotificationPriority.NORMAL,
      title: `Ngựa ${horse.horseName} chuyển ô`,
      message: `Ngựa ${horse.horseName} đã được xếp vào ô ${notice.stallCode} khu "${barn.barnName}".`,
      resource: horseResource(notice.horseId),
    });
  }

  /**
   * Báo Groom khi phân công chăm ngựa thay đổi.
   *
   * - Groom mới nhận "được phân công chăm ngựa"; Groom cũ nhận "không còn phụ trách ngựa"
   * - Ghi bằng connection riêng, không nhận EntityManager
   * - Idempotent theo notice.eventId: gọi lại cùng eventId không sinh thông báo trùng
   * - Không tìm thấy ngựa thì log cảnh báo và bỏ qua
   *
   * @param notice Payload của GROOM_ASSIGNMENT_CHANGED_EVENT: ngựa, Groom mới, Groom cũ và eventId chống trùng
   * @returns Promise trả về id những người nhận vừa được lưu mới
   */
  async notifyGroomChanged(
    notice: GroomAssignmentChangedEvent,
  ): Promise<string[]> {
    const horseName = await this.horseName(notice.horseId);
    if (!horseName) {
      this.logger.warn(
        `Bỏ qua thông báo đổi Groom ${notice.eventId}: không tìm thấy ngựa ${notice.horseId}`,
      );
      return [];
    }
    const sent: string[] = [];
    if (notice.newGroomId) {
      sent.push(
        ...(await this.notifications.send({
          eventId: notice.eventId,
          recipientIds: [notice.newGroomId],
          category: NotificationCategory.GROOM_ASSIGNMENT,
          priority: NotificationPriority.NORMAL,
          title: 'Phân công chăm ngựa mới',
          message: `Bạn được phân công chăm sóc ngựa ${horseName}. Công việc hằng ngày của ngựa này giờ thuộc về bạn.`,
          resource: horseResource(notice.horseId),
        })),
      );
    }
    if (notice.previousGroomId) {
      sent.push(
        ...(await this.notifications.send({
          eventId: notice.eventId,
          recipientIds: [notice.previousGroomId],
          category: NotificationCategory.GROOM_ASSIGNMENT,
          priority: NotificationPriority.NORMAL,
          title: 'Kết thúc phân công chăm ngựa',
          message: `Bạn không còn phụ trách ngựa ${horseName}. Bạn vẫn xem được hồ sơ nhưng không thao tác được trên con ngựa này.`,
          resource: horseResource(notice.horseId),
        })),
      );
    }
    return sent;
  }

  /**
   * Báo Groom của checklist có việc mới trong checklist hôm nay của ngựa
   *
   * @param notice Payload do module stable phát khi thêm việc vào checklist
   * @returns Promise trả về id các thông báo đã gửi; không tìm thấy ngựa thì trả mảng rỗng
   */
  async notifyChecklistTaskAdded(
    notice: ChecklistTaskAddedEvent,
  ): Promise<string[]> {
    const horseName = await this.horseName(notice.horseId);
    if (!horseName) {
      this.logger.warn(
        `Bỏ qua thông báo thêm việc ${notice.eventId}: không tìm thấy ngựa ${notice.horseId}`,
      );
      return [];
    }
    return this.notifications.send({
      eventId: notice.eventId,
      recipientIds: [notice.groomId],
      category: NotificationCategory.DAILY_CHECKLIST,
      priority: NotificationPriority.NORMAL,
      title: 'Có việc mới hôm nay',
      message: `Ngựa ${horseName} có thêm việc "${notice.taskName}" trong checklist hôm nay.`,
      resource: horseResource(notice.horseId),
    });
  }

  /**
   * Báo Head Trainer của khu chứa ngựa khi bác sĩ gắn thêm, miễn hoặc gỡ việc riêng của ngựa
   *
   * - Nêu tên ngựa, việc, kiểu đổi, khoảng ngày, lý do (nếu có) và tên bác sĩ
   * - Ngựa không có khu, khu không có Head Trainer đang hoạt động, hoặc Head Trainer chính là bác sĩ đã đổi thì không gửi
   * - Idempotent theo notice.eventId
   *
   * @param notice Payload do module stable phát khi bác sĩ đổi việc riêng
   * @returns Promise trả về id các thông báo đã gửi; không gửi thì trả mảng rỗng
   */
  async notifyCareTaskChanged(notice: CareTaskChangedEvent): Promise<string[]> {
    const horse = await this.recipients.findHorseBarnContact(notice.horseId);
    if (
      !horse?.headTrainerId ||
      horse.headTrainerId === notice.veterinarianId
    ) {
      return [];
    }
    const change = describeCareTaskChange(notice);
    const range = `từ ${toDisplayDate(notice.fromDate)} đến ${toDisplayDate(notice.toDate)}`;
    const reason = notice.note ? ` Lý do: ${notice.note}.` : '';
    return this.notifications.send({
      eventId: notice.eventId,
      recipientIds: [horse.headTrainerId],
      category: NotificationCategory.DAILY_CHECKLIST,
      priority: NotificationPriority.NORMAL,
      title: 'Bác sĩ đổi việc riêng của ngựa',
      message: `Bác sĩ ${notice.veterinarianName} ${change} "${notice.taskName}" (${range}) cho ngựa ${horse.horseName}.${reason}`,
      resource: horseResource(notice.horseId),
    });
  }

  /**
   * Báo mọi Club Manager đang hoạt động khi checklist hôm nay vẫn chưa sinh được sau nhiều lần thử
   *
   * - Có tên ngựa thì nêu tên các ngựa chưa có checklist
   * - Idempotent theo notice.eventId
   *
   * @param notice Payload do module stable phát khi sinh checklist hôm nay còn lỗi
   * @returns Promise trả về id những người nhận vừa được lưu mới
   */
  async notifyChecklistGenerationFailed(
    notice: ChecklistGenerationFailedEvent,
  ): Promise<string[]> {
    const subject = notice.horseNames.length
      ? `Chưa có checklist hôm nay cho ${notice.horseNames.join(', ')}.`
      : 'Chưa sinh được checklist hôm nay.';
    return this.notifications.send({
      eventId: notice.eventId,
      recipientIds: await this.recipients.findActiveUserIdsByRole(
        UserRole.CLUB_MANAGER,
      ),
      category: NotificationCategory.DAILY_CHECKLIST,
      priority: NotificationPriority.HIGH,
      title: 'Lỗi sinh checklist hôm nay',
      message: `${subject} Hệ thống đang thử lại.`,
      resource: null,
    });
  }

  /**
   * Báo mọi Club Manager đang hoạt động khi checklist hôm nay đã sinh đủ sau khi đã báo lỗi
   *
   * - Idempotent theo notice.eventId
   *
   * @param notice Payload do module stable phát khi checklist hôm nay đã đủ
   * @returns Promise trả về id những người nhận vừa được lưu mới
   */
  async notifyChecklistGenerationRecovered(
    notice: ChecklistGenerationRecoveredEvent,
  ): Promise<string[]> {
    return this.notifications.send({
      eventId: notice.eventId,
      recipientIds: await this.recipients.findActiveUserIdsByRole(
        UserRole.CLUB_MANAGER,
      ),
      category: NotificationCategory.DAILY_CHECKLIST,
      priority: NotificationPriority.NORMAL,
      title: 'Checklist hôm nay đã đủ',
      message: 'Đã có đủ checklist hôm nay.',
      resource: null,
    });
  }

  /**
   * Báo người dắt từng ngựa khi Head Trainer hủy buổi tập
   *
   * - Người nhận của mỗi lượt: Groom được giao dắt nếu còn ACTIVE với vai trò GROOM; lượt chưa có người dắt thì Groom đang phụ trách ngựa
   * - Mỗi người nhận một thông báo, liệt kê các ngựa của mình trong buổi; idempotent theo notice.eventId
   * - Lượt không tìm được ai để báo thì bỏ qua
   *
   * @param notice Payload do module training phát khi hủy buổi tập
   * @returns Promise trả về id những người nhận vừa được lưu mới
   */
  async notifySessionCancelled(
    notice: TrainingSessionCancelledEvent,
  ): Promise<string[]> {
    const horsesByGroom = new Map<string, string[]>();
    for (const run of notice.runs) {
      const horse = await this.recipients.findHorseMedicalContact(run.horseId);
      if (!horse) continue;
      const handlerActive =
        run.groomId !== null &&
        (await this.recipients.isActiveUserWithRole(
          run.groomId,
          UserRole.GROOM,
        ));
      const groomId = handlerActive ? run.groomId : horse.groomId;
      if (!groomId) continue;
      horsesByGroom.set(groomId, [
        ...(horsesByGroom.get(groomId) ?? []),
        horse.horseName,
      ]);
    }
    const sent: string[] = [];
    for (const [groomId, horseNames] of horsesByGroom) {
      sent.push(
        ...(await this.notifications.send({
          eventId: notice.eventId,
          recipientIds: [groomId],
          category: NotificationCategory.TRAINING_SESSION,
          priority: NotificationPriority.HIGH,
          title: `Buổi tập ${notice.sessionName} đã hủy`,
          message: `Buổi tập ${notice.sessionName} lúc ${formatClubDateTime(notice.scheduledStartAt)} đã hủy: ${notice.reason}. Không dắt ${horseNames.join(', ')} ra sân.`,
          resource: null,
        })),
      );
    }
    return sent;
  }

  /**
   * Báo Groom vừa được Head Trainer giao dắt một lượt tập
   *
   * - Thông báo nêu ngựa, buổi, giờ bắt đầu theo giờ CLB, địa điểm và mặt sân nếu buổi có ghi
   * - Idempotent theo notice.eventId
   *
   * @param notice Payload do module training phát khi giao người dắt
   * @returns Promise trả về id những người nhận vừa được lưu mới
   */
  notifyRunGroomAssigned(
    notice: TrainingRunGroomAssignedEvent,
  ): Promise<string[]> {
    const place = [
      notice.location ? `tại ${notice.location}` : null,
      notice.surface ? `mặt sân ${notice.surface}` : null,
    ].filter(Boolean);
    return this.notifications.send({
      eventId: notice.eventId,
      recipientIds: [notice.groomId],
      category: NotificationCategory.TRAINING_SESSION,
      priority: NotificationPriority.NORMAL,
      title: `Được giao dắt ${notice.horseName}`,
      message: `Bạn được giao dắt ${notice.horseName} ở buổi tập ${notice.sessionName} lúc ${formatClubDateTime(notice.scheduledStartAt)}${place.length ? `, ${place.join(', ')}` : ''}.`,
      resource: null,
    });
  }

  /**
   * Báo Head Trainer của khu chứa ngựa và chủ ngựa khi có phụ phí chăm sóc riêng mới
   *
   * - Head Trainer: để sắp xếp chăm sóc theo nội dung; ngựa không có khu hoặc khu không có Head Trainer đang hoạt động thì bỏ
   * - Chủ ngựa đang ACTIVE: để biết khoản phí; ngựa chưa có chủ thì bỏ
   *
   * @param notice Payload do module billing phát khi Club Manager ghi phụ phí
   * @returns Promise trả về id các thông báo đã gửi; không gửi thì trả mảng rỗng
   */
  async notifySurchargeAdded(notice: SurchargeAddedEvent): Promise<string[]> {
    const horse = await this.recipients.findHorseMedicalContact(notice.horseId);
    if (!horse) return [];
    const period = `từ ${toDisplayDate(notice.startDate)} đến ${toDisplayDate(notice.endDate)}`;
    const toTrainer = horse.headTrainerId
      ? await this.notifications.send({
          eventId: notice.eventId,
          recipientIds: [horse.headTrainerId],
          category: NotificationCategory.SURCHARGE,
          priority: NotificationPriority.NORMAL,
          title: 'Ngựa có chế độ chăm sóc riêng',
          message: `Ngựa ${horse.horseName} ${period}: ${notice.description}`,
          resource: horseResource(notice.horseId),
        })
      : [];
    const toOwner = horse.ownerId
      ? await this.notifications.send({
          eventId: notice.eventId,
          recipientIds: [horse.ownerId],
          category: NotificationCategory.SURCHARGE,
          priority: NotificationPriority.NORMAL,
          title: `Phụ phí chăm sóc riêng cho ngựa ${horse.horseName}`,
          message: `${notice.description}, ${period}, ${notice.dailyAmount.toLocaleString('vi-VN')} đồng mỗi ngày`,
          resource: horseResource(notice.horseId),
        })
      : [];
    return [...toTrainer, ...toOwner];
  }

  /**
   * Báo Head Trainer của khu chứa ngựa có sự cố mới tại chuồng, kèm Groom đang phụ trách ngựa khi người khác báo hộ
   *
   * - Sự cố khẩn gửi mức HIGH, còn lại NORMAL
   * - Ngựa không có khu hoặc khu không có Head Trainer đang hoạt động thì bỏ Head Trainer
   * - Groom phụ trách lấy từ notice.assignedGroomId (chụp lúc báo); không có thì bỏ
   * - Không còn ai nhận hoặc không tìm thấy ngựa thì không gửi
   *
   * @param notice Payload do module stable phát khi Groom báo sự cố
   * @returns Promise trả về id các thông báo đã gửi; không gửi thì trả mảng rỗng
   */
  async notifyIncidentReported(
    notice: IncidentReportedEvent,
  ): Promise<string[]> {
    const horse = await this.recipients.findHorseBarnContact(notice.horseId);
    if (!horse) return [];
    const recipientIds = [horse.headTrainerId, notice.assignedGroomId].filter(
      (id): id is string => !!id,
    );
    if (recipientIds.length === 0) return [];
    return this.notifications.send({
      eventId: notice.eventId,
      recipientIds,
      category: NotificationCategory.INCIDENT,
      priority: notice.urgent
        ? NotificationPriority.HIGH
        : NotificationPriority.NORMAL,
      title: notice.urgent ? 'Sự cố khẩn tại chuồng' : 'Sự cố tại chuồng',
      message: `Ngựa ${horse.horseName}: ${notice.description}`,
      resource: horseResource(notice.horseId),
    });
  }

  /**
   * Báo người báo sự cố và Groom đang phụ trách ngựa khi Head Trainer chuyển sự cố cho bác sĩ hoặc đóng sự cố
   *
   * - REFERRED: báo sự cố đã được chuyển bác sĩ khám; RESOLVED: báo sự cố đã xử lý kèm kết quả
   * - Người báo cũng là Groom phụ trách thì chỉ nhận một lần; bỏ người đã chuyển hoặc đóng sự cố
   * - Không còn ai nhận hoặc không tìm thấy ngựa thì không gửi; idempotent theo notice.eventId
   *
   * @param notice Payload do module stable phát khi chuyển bác sĩ hoặc đóng sự cố
   * @returns Promise trả về id những người nhận vừa được lưu mới; không gửi thì trả mảng rỗng
   */
  async notifyIncidentHandled(notice: IncidentHandledEvent): Promise<string[]> {
    const horse = await this.recipients.findHorseMedicalContact(notice.horseId);
    if (!horse) return [];
    const recipientIds = [
      ...new Set([notice.reportedBy, horse.groomId]),
    ].filter((id): id is string => !!id && id !== notice.handledBy);
    if (recipientIds.length === 0) return [];
    const referred = notice.action === 'REFERRED';
    return this.notifications.send({
      eventId: notice.eventId,
      recipientIds,
      category: NotificationCategory.INCIDENT,
      priority: NotificationPriority.NORMAL,
      title: referred
        ? `Sự cố ngựa ${horse.horseName} đã chuyển bác sĩ`
        : `Sự cố ngựa ${horse.horseName} đã xử lý`,
      message: referred
        ? `Sự cố của ngựa ${horse.horseName} đã được chuyển bác sĩ khám.`
        : `Sự cố của ngựa ${horse.horseName} đã xử lý: ${notice.resolution}`,
      resource: horseResource(notice.horseId),
    });
  }

  /**
   * Nhắc Head Trainer của khu và mọi Club Manager đang hoạt động về sự cố còn mở quá hạn mà chưa chuyển bác sĩ
   *
   * - Không tìm thấy ngựa thì không gửi
   *
   * @param notice Payload do module stable phát khi sự cố quá hạn
   * @returns Promise trả về id các thông báo đã gửi; không gửi thì trả mảng rỗng
   */
  async notifyIncidentStale(notice: IncidentStaleEvent): Promise<string[]> {
    const horse = await this.recipients.findHorseBarnContact(notice.horseId);
    if (!horse) {
      this.logger.warn(
        `Bỏ qua nhắc sự cố ${notice.incidentId}: không tìm thấy ngựa ${notice.horseId}`,
      );
      return [];
    }
    const recipientIds = await this.recipients.findActiveUserIdsByRole(
      UserRole.CLUB_MANAGER,
    );
    if (horse.headTrainerId) recipientIds.push(horse.headTrainerId);
    return this.notifications.send({
      eventId: notice.eventId,
      recipientIds,
      category: NotificationCategory.INCIDENT,
      priority: NotificationPriority.HIGH,
      title: 'Sự cố chưa được xử lý',
      message: `Ngựa ${horse.horseName}: sự cố mở ${notice.hours} giờ chưa được xử lý. ${notice.description}`,
      resource: horseResource(notice.horseId),
    });
  }

  /**
   * Báo Groom khi ngựa chuyển nhượng làm phân công chăm ngựa của họ tự kết thúc.
   *
   * - Ghi bằng connection riêng, không nhận EntityManager
   * - Idempotent theo notice.eventId
   * - Không tìm thấy ngựa thì log cảnh báo và bỏ qua
   *
   * @param notice Payload của HORSE_GROOM_RELEASED_BY_TRANSFER_EVENT: ngựa, Groom bị kết thúc phân công và eventId chống trùng
   * @returns Promise trả về id những người nhận vừa được lưu mới
   */
  async notifyGroomReleasedByTransfer(
    notice: HorseGroomReleasedEvent,
  ): Promise<string[]> {
    const horseName = await this.horseName(notice.horseId);
    if (!horseName) {
      this.logger.warn(
        `Bỏ qua thông báo chuyển nhượng ${notice.eventId}: không tìm thấy ngựa ${notice.horseId}`,
      );
      return [];
    }
    return this.notifications.send({
      eventId: notice.eventId,
      recipientIds: [notice.groomId],
      category: NotificationCategory.GROOM_ASSIGNMENT,
      priority: NotificationPriority.NORMAL,
      title: 'Ngựa đã chuyển nhượng',
      message: `Ngựa ${horseName} đã chuyển nhượng, bạn không còn phụ trách con ngựa này. Bạn vẫn xem được hồ sơ nhưng không thao tác được.`,
      resource: horseResource(notice.horseId),
    });
  }

  /**
   * Báo chủ ngựa khi ngựa giải nghệ, chuyển nhượng hoặc hoạt động trở lại; báo thêm Groom khi giải nghệ và Head Trainer của các lớp vừa bị rút
   *
   * - Chủ: người nhận là chủ chụp trong event (bán ra ngoài: chủ vừa kết thúc sở hữu), chỉ khi còn là HORSE_OWNER đang ACTIVE; event không có chủ thì bỏ
   * - Chủ không còn là chủ hiện tại thì thông báo không gắn link tới ngựa
   * - Giải nghệ: Groom đang phụ trách nhận cùng nội dung, gắn link tới ngựa; ngựa chưa có Groom thì bỏ
   * - Head Trainer của các lớp vừa bị rút: mỗi người một thông báo nêu các lớp của mình và lý do (theo notifyClassesWithdrawn)
   * - Không tìm thấy ngựa thì không gửi; idempotent theo event.eventId
   *
   * @param event Payload của HORSE_LIFECYCLE_CHANGED_EVENT
   * @returns Promise trả về id những người nhận vừa được lưu mới
   */
  async notifyLifecycleChanged(
    event: HorseLifecycleChangedEvent,
  ): Promise<string[]> {
    const ownerActive =
      !!event.ownerId &&
      (await this.recipients.isActiveUserWithRole(
        event.ownerId,
        UserRole.HORSE_OWNER,
      ));
    const contact = await this.recipients.findHorseMedicalContact(
      event.horseId,
    );
    if (!contact) return [];
    const draft = {
      eventId: event.eventId,
      category: NotificationCategory.HORSE_LIFECYCLE,
      priority: NotificationPriority.NORMAL,
      title: `Ngựa ${contact.horseName}: ${HORSE_LIFECYCLE_LABELS[event.to]}`,
      message: `Vòng đời của ngựa ${contact.horseName} chuyển từ ${HORSE_LIFECYCLE_LABELS[event.from]} sang ${HORSE_LIFECYCLE_LABELS[event.to]}. Lý do: ${event.reason}`,
    };
    const toOwner =
      ownerActive && event.ownerId
        ? await this.notifications.send({
            ...draft,
            recipientIds: [event.ownerId],
            resource:
              contact.ownerId === event.ownerId
                ? horseResource(event.horseId)
                : null,
          })
        : [];
    const groomId =
      event.to === HorseLifecycleStatus.RETIRED ? contact.groomId : null;
    const toGroom = groomId
      ? await this.notifications.send({
          ...draft,
          recipientIds: [groomId],
          resource: horseResource(event.horseId),
        })
      : [];
    const toClasses = await this.notifyClassesWithdrawn(
      event.eventId,
      contact.horseName,
      event.withdrawnClassIds,
      `${HORSE_LIFECYCLE_LABELS[event.to]}: ${event.reason}`,
      [event.ownerId, groomId],
    );
    return [...toOwner, ...toGroom, ...toClasses];
  }

  /**
   * Báo chủ ngựa, Huấn luyện viên trưởng của khu cũ, Groom cũ và mọi Club Manager khi ngựa được ghi nhận đã mất.
   *
   * - Khu và Groom lấy từ payload (trước khi bị dọn); chủ ngựa chỉ nhận khi còn là HORSE_OWNER đang ACTIVE
   * - Huấn luyện viên trưởng chỉ nhận khi khu còn và người đó còn ACTIVE, còn vai trò HEAD_TRAINER
   * - Club Manager: mọi tài khoản CLUB_MANAGER đang ACTIVE, kể cả người vừa ghi nhận; mỗi người chỉ nhận một lần
   * - Head Trainer của các lớp vừa bị rút mà chưa nhận thông báo ngựa mất: mỗi người một thông báo nêu các lớp của mình (theo notifyClassesWithdrawn)
   * - Ghi bằng connection riêng, không nhận EntityManager; idempotent theo event.eventId
   * - Không tìm thấy ngựa thì log cảnh báo và bỏ qua
   *
   * @param event Payload của HORSE_DECEASED_EVENT
   * @returns Promise trả về id những người nhận vừa được lưu mới
   */
  async notifyHorseDeceased(event: HorseDeceasedEvent): Promise<string[]> {
    const contact = await this.recipients.findHorseMedicalContact(
      event.horseId,
    );
    if (!contact) {
      this.logger.warn(
        `Bỏ qua thông báo ngựa mất ${event.eventId}: không tìm thấy ngựa ${event.horseId}`,
      );
      return [];
    }
    const barn = event.barnId
      ? await this.recipients.findBarnContact(event.barnId)
      : null;
    const clubManagerIds = await this.recipients.findActiveUserIdsByRole(
      UserRole.CLUB_MANAGER,
    );
    const recipientIds = [
      ...new Set(
        [
          contact.ownerId,
          barn?.headTrainerId ?? null,
          event.groomId,
          ...clubManagerIds,
        ].filter((id): id is string => id !== null),
      ),
    ];
    const toAll = await this.notifications.send({
      eventId: event.eventId,
      recipientIds,
      category: NotificationCategory.HORSE_LIFECYCLE,
      priority: NotificationPriority.HIGH,
      title: `Ngựa ${contact.horseName} đã mất`,
      message: `Ngày mất ${toDisplayDate(event.dateOfDeath)}. Nguyên nhân: ${event.reason}`,
      resource: horseResource(event.horseId),
    });
    const toClasses = await this.notifyClassesWithdrawn(
      event.eventId,
      contact.horseName,
      event.withdrawnClassIds,
      `${HORSE_LIFECYCLE_LABELS[HorseLifecycleStatus.DECEASED]}: ${event.reason}`,
      recipientIds,
    );
    return [...toAll, ...toClasses];
  }

  /**
   * Báo chủ mới và chủ cũ khi ngựa được chuyển nhượng nội bộ.
   *
   * - Chủ mới: thông báo trỏ tới hồ sơ ngựa
   * - Chủ cũ: không còn quyền xem ngựa nên thông báo không trỏ tới đâu (resource null)
   * - Ghi bằng connection riêng, không nhận EntityManager; idempotent theo event.eventId
   * - Không tìm thấy ngựa thì log cảnh báo và bỏ qua
   *
   * @param event Payload của HORSE_OWNERSHIP_TRANSFERRED_EVENT
   * @returns Promise trả về id những người nhận vừa được lưu mới
   */
  async notifyOwnershipTransferred(
    event: HorseOwnershipTransferredEvent,
  ): Promise<string[]> {
    const horseName = await this.horseName(event.horseId);
    if (!horseName) {
      this.logger.warn(
        `Bỏ qua thông báo chuyển chủ ${event.eventId}: không tìm thấy ngựa ${event.horseId}`,
      );
      return [];
    }
    const since = `Hiệu lực từ ${toDisplayDate(toClubDate(event.transferredAt))}`;
    const toNewOwner = await this.notifications.send({
      eventId: event.eventId,
      recipientIds: [event.toOwnerId],
      category: NotificationCategory.OWNERSHIP,
      priority: NotificationPriority.NORMAL,
      title: `Bạn đã trở thành chủ sở hữu ngựa ${horseName}`,
      message: since,
      resource: horseResource(event.horseId),
    });
    const toOldOwner = await this.notifications.send({
      eventId: event.eventId,
      recipientIds: [event.fromOwnerId],
      category: NotificationCategory.OWNERSHIP,
      priority: NotificationPriority.NORMAL,
      title: `Ngựa ${horseName} đã chuyển sang chủ khác`,
      message: `${since}. Chi phí y tế trong thời gian bạn sở hữu vẫn được giữ trong báo cáo`,
      resource: null,
    });
    return [...toNewOwner, ...toOldOwner];
  }

  /**
   * Báo chủ mới khi hồ sơ ngựa được tạo hoặc ngựa chưa có chủ được gán chủ qua sửa hồ sơ.
   *
   * - Thông báo trỏ tới hồ sơ ngựa
   * - Ghi bằng connection riêng, không nhận EntityManager; idempotent theo event.eventId
   * - Không tìm thấy ngựa thì log cảnh báo và bỏ qua
   *
   * @param event Payload của HORSE_OWNER_ASSIGNED_EVENT
   * @returns Promise trả về id những người nhận vừa được lưu mới
   */
  async notifyOwnerAssigned(event: HorseOwnerAssignedEvent): Promise<string[]> {
    const horseName = await this.horseName(event.horseId);
    if (!horseName) {
      this.logger.warn(
        `Bỏ qua thông báo gán chủ ${event.eventId}: không tìm thấy ngựa ${event.horseId}`,
      );
      return [];
    }
    return this.notifications.send({
      eventId: event.eventId,
      recipientIds: [event.ownerId],
      category: NotificationCategory.OWNERSHIP,
      priority: NotificationPriority.NORMAL,
      title: `Bạn đã trở thành chủ sở hữu ngựa ${horseName}`,
      message: `Hiệu lực từ ${toDisplayDate(toClubDate(event.assignedAt))}`,
      resource: horseResource(event.horseId),
    });
  }

  /**
   * Báo Head Trainer đang phụ trách các lớp mà ngựa vừa bị rút, mỗi người một thông báo
   *
   * - Mỗi thông báo nêu các lớp của người đó (theo tên lớp) và lý do rút; không gắn link
   * - Lớp không có Head Trainer đang ACTIVE thì bỏ; người đã nhận thông báo khác của cùng event thì bỏ
   * - Không có lớp nào (kể cả payload không có trường này) thì không gửi
   *
   * @param eventId Id của event gây rút lớp, dùng làm khóa chống trùng
   * @param horseName Tên ngựa
   * @param classIds UUID các lớp vừa bị rút, undefined khi payload không có trường này
   * @param cause Lý do rút lớp hiển thị sau "Lý do:"
   * @param notifiedIds Người đã nhận thông báo khác của cùng event
   * @returns Promise trả về id những người nhận vừa được lưu mới
   */
  private async notifyClassesWithdrawn(
    eventId: string,
    horseName: string,
    classIds: string[] | undefined,
    cause: string,
    notifiedIds: Array<string | null>,
  ): Promise<string[]> {
    if (!classIds?.length) return [];
    const classesByTrainer = new Map<string, string[]>();
    const classes = await this.recipients.findClassHeadTrainers(classIds);
    for (const { className, headTrainerId } of classes) {
      if (notifiedIds.includes(headTrainerId)) continue;
      classesByTrainer.set(headTrainerId, [
        ...(classesByTrainer.get(headTrainerId) ?? []),
        `"${className}"`,
      ]);
    }
    const sent: string[] = [];
    for (const [headTrainerId, classNames] of classesByTrainer) {
      sent.push(
        ...(await this.notifications.send({
          eventId,
          recipientIds: [headTrainerId],
          category: NotificationCategory.TRAINING_CLASS,
          priority: NotificationPriority.NORMAL,
          title: `Ngựa ${horseName} rút khỏi lớp`,
          message: `Ngựa ${horseName} đã được rút khỏi lớp ${classNames.join(', ')}. Lý do: ${cause}`,
          resource: null,
        })),
      );
    }
    return sent;
  }

  /**
   * Lấy tên ngựa theo id, đọc cả hồ sơ đã xóa mềm
   *
   * @param horseId UUID của ngựa
   * @returns Promise trả về tên ngựa, null nếu không có
   */
  private async horseName(horseId: string): Promise<string | null> {
    const horse = await this.dataSource.manager.findOne(HorseEntity, {
      where: { id: horseId },
      withDeleted: true,
      select: { id: true, name: true },
    });
    return horse?.name ?? null;
  }
}

/**
 * Đổi mức độ cảnh báo chỉ số sang mức ưu tiên thông báo.
 *
 * @param severity Mức độ cảnh báo do module horses tính
 * @returns URGENT cho cảnh báo khẩn, HIGH cho cảnh báo thường
 */
function toAlertPriority(
  severity: HorseMeasurementAlertSeverity,
): NotificationPriority {
  return severity === HorseMeasurementAlertSeverity.URGENT
    ? NotificationPriority.URGENT
    : NotificationPriority.HIGH;
}

/**
 * Soạn tiêu đề và nội dung tiếng Việt cho một cảnh báo chỉ số, có tên ngựa và giá trị đo.
 *
 * @param horseName Tên ngựa
 * @param event Event cảnh báo số đo
 * @returns Tiêu đề và nội dung thông báo
 */
function describeMeasurementAlert(
  horseName: string,
  event: HorseMeasurementAlertEvent,
): { title: string; message: string } {
  switch (event.alert) {
    case HorseMeasurementAlert.FEVER:
      return {
        title: `KHẨN: Ngựa ${horseName} bị sốt`,
        message: `Ngựa ${horseName} có thân nhiệt ${formatMeasurement(event.value, event.unit)}, vượt ngưỡng sốt. Cần kiểm tra ngay.`,
      };
    case HorseMeasurementAlert.WEIGHT_DROP:
      return {
        title: `Cảnh báo: Ngựa ${horseName} giảm cân`,
        message: `Ngựa ${horseName} giảm ${event.dropPercent}% cân nặng trong ${WEIGHT_DROP_WINDOW_DAYS} ngày (từ ${formatMeasurement(event.baselineValue, event.unit)} xuống ${formatMeasurement(event.value, event.unit)}).`,
      };
  }
}

/**
 * Chọn cụm động từ mô tả kiểu đổi việc riêng
 *
 * @param notice Payload của CARE_TASK_CHANGED_EVENT
 * @returns "gắn thêm việc", "miễn việc", "gỡ việc gắn thêm" hoặc "gỡ miễn việc"
 */
function describeCareTaskChange(notice: CareTaskChangedEvent): string {
  const exempt = notice.mode === HorseCareTaskMode.EXEMPT;
  if (notice.action === 'ADDED') return exempt ? 'miễn việc' : 'gắn thêm việc';
  return exempt ? 'gỡ miễn việc' : 'gỡ việc gắn thêm';
}

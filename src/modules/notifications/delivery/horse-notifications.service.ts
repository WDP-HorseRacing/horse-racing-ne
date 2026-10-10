import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { toClubDate, toDisplayDate } from '../../../common/utils/club-date';
import { UserRole } from '../../../common/enums/role.enum';
import {
  HorseMeasurementAlert,
  HorseMeasurementAlertSeverity,
} from '../../horses/enums/horse-measurement-alert.enum';
import { WEIGHT_DROP_WINDOW_DAYS } from '../../horses/constants/horse.constants';
import { HorseEntity } from '../../horses/entities/horse.entity';
import { formatMeasurement } from '../../horses/utils/measurement-format';
import type {
  HorseBarnAssignedEvent,
  HorseDeceasedEvent,
  HorseGroomReleasedEvent,
  HorseOwnershipTransferredEvent,
  HorseMeasurementAlertEvent,
} from '../../horses/types/horse.types';
import type {
  ChecklistTaskAddedEvent,
  GroomAssignmentChangedEvent,
} from '../../stable/types/stable-events.types';
import { NotificationPriority } from '../enums/notification-priority.enum';
import { NotificationCategory } from '../enums/notification-category.enum';
import { horseResource } from '../mappers/notification.mapper';
import { NotificationRecipientsRepository } from './notification-recipients.repository';
import { NotificationDeliveryService } from './notification-delivery.service';

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
   * - Người nhận: mọi Veterinarian đang ACTIVE và Head Trainer đang ACTIVE phụ trách khu hiện tại của ngựa
   * - Ngựa chưa có khu (hoặc khu chưa có Head Trainer) thì chỉ gửi cho Veterinarian
   * - Mức ưu tiên lấy theo severity của event: URGENT → URGENT, WARNING → HIGH
   * - eventId của thông báo là measurementId: event phát lại không sinh thông báo trùng
   * - Không tìm thấy ngựa thì log cảnh báo và bỏ qua
   *
   * @param event Event cảnh báo số đo do module horses phát
   * @returns Promise trả về danh sách id người nhận vừa được lưu mới
   */
  async notifyMeasurementAlert(
    event: HorseMeasurementAlertEvent,
  ): Promise<string[]> {
    const horse = await this.recipients.findHorseBarnContact(event.horseId);
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

    return this.notifications.send({
      eventId: event.measurementId,
      recipientIds,
      category: NotificationCategory.MEASUREMENT_ALERT,
      priority: toAlertPriority(event.severity),
      ...describeMeasurementAlert(horse.horseName, event),
      resource: horseResource(event.horseId),
    });
  }

  /**
   * Báo Head Trainer của khu khi một con ngựa được xếp hoặc đổi vào khu đó.
   *
   * - Ghi bằng connection riêng, không nhận EntityManager
   * - Người nhận: Head Trainer đang ACTIVE phụ trách khu; khu chưa có Head Trainer thì không gửi gì
   * - Idempotent theo notice.eventId: phát lại cùng event không sinh thông báo trùng
   * - Không tìm thấy ngựa hoặc khu (đã bị xóa) thì log cảnh báo và bỏ qua
   *
   * @param notice Payload của HORSE_BARN_ASSIGNED_EVENT: ngựa, khu mới và eventId chống trùng
   * @returns Promise trả về danh sách id người nhận vừa được lưu mới (rỗng nếu không có ai để báo)
   */
  async notifyBarnAssigned(notice: HorseBarnAssignedEvent): Promise<string[]> {
    const [horseName, barn] = await Promise.all([
      this.horseName(notice.horseId),
      this.recipients.findBarnContact(notice.barnId),
    ]);
    if (!horseName || !barn) {
      this.logger.warn(
        `Bỏ qua thông báo xếp khu ${notice.eventId}: không tìm thấy ngựa ${notice.horseId} hoặc khu ${notice.barnId}`,
      );
      return [];
    }
    if (!barn.headTrainerId) {
      return [];
    }

    return this.notifications.send({
      eventId: notice.eventId,
      recipientIds: [barn.headTrainerId],
      category: NotificationCategory.BARN_ASSIGNED,
      priority: NotificationPriority.NORMAL,
      title: 'Ngựa mới vào khu phụ trách',
      message: `Ngựa ${horseName} vừa được xếp vào khu "${barn.barnName}". Vui lòng xếp ô chuồng và đăng ký lớp huấn luyện nếu cần.`,
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
   * Báo chủ ngựa, Huấn luyện viên trưởng của khu cũ, Groom cũ và mọi Club Manager khi ngựa được ghi nhận đã mất.
   *
   * - Khu và Groom lấy từ payload (trước khi bị dọn); chủ ngựa chỉ nhận khi còn là HORSE_OWNER đang ACTIVE
   * - Huấn luyện viên trưởng chỉ nhận khi khu còn và người đó còn ACTIVE, còn vai trò HEAD_TRAINER
   * - Club Manager: mọi tài khoản CLUB_MANAGER đang ACTIVE, kể cả người vừa ghi nhận; mỗi người chỉ nhận một lần
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
    return this.notifications.send({
      eventId: event.eventId,
      recipientIds,
      category: NotificationCategory.HORSE_LIFECYCLE,
      priority: NotificationPriority.HIGH,
      title: `Ngựa ${contact.horseName} đã mất`,
      message: `Ngày mất ${toDisplayDate(event.dateOfDeath)}. Nguyên nhân: ${event.reason}`,
      resource: horseResource(event.horseId),
    });
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

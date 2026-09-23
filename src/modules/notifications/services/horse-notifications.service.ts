import { Injectable, Logger } from '@nestjs/common';
import {
  HorseMeasurementAlert,
  HorseMeasurementAlertSeverity,
} from '../../horses/enums/horse-measurement-alert.enum';
import { WEIGHT_DROP_WINDOW_DAYS } from '../../horses/constants/horse.constants';
import type {
  HorseBarnAssignedEvent,
  HorseGroomReleasedEvent,
  HorseMeasurementAlertEvent,
} from '../../horses/types/horse.types';
import type { GroomAssignmentChangedEvent } from '../../stable/types/stable-events.types';
import { NotificationPriority } from '../constants/notification-priority.enum';
import { NotificationType } from '../constants/notification-type.enum';
import { NotificationRecipientsRepository } from '../repositories/notification-recipients.repository';
import { NotificationsService } from './notifications.service';

@Injectable()
export class HorseNotificationsService {
  private readonly logger = new Logger(HorseNotificationsService.name);

  constructor(
    private readonly recipients: NotificationRecipientsRepository,
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * Gửi thông báo cho một cảnh báo chỉ số cơ thể (F1.5 mục 6).
   *
   * - Người nhận: mọi Veterinarian đang ACTIVE và Head Trainer đang ACTIVE phụ trách khu hiện tại của ngựa
   * - Ngựa chưa có khu (hoặc khu chưa có Head Trainer) thì chỉ gửi cho Veterinarian
   * - Mức ưu tiên lấy theo severity của event: URGENT → URGENT, WARNING → HIGH
   * - eventId của thông báo là measurementId, nên event bị phát lại cũng không sinh thông báo trùng
   * - Không tìm thấy ngựa thì log cảnh báo và bỏ qua
   *
   * @param event The measurement alert event published by the horses module
   * @returns A promise resolving to danh sách id người nhận vừa được lưu mới
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

    const recipientIds = await this.recipients.findActiveVeterinarianIds();
    if (horse.headTrainerId) {
      recipientIds.push(horse.headTrainerId);
    }

    return this.notifications.send({
      eventId: event.measurementId,
      recipientIds,
      type: NotificationType.WARNING,
      priority: toAlertPriority(event.severity),
      ...describeMeasurementAlert(horse.horseName, event),
    });
  }

  /**
   * Báo Head Trainer của khu khi một con ngựa được xếp hoặc đổi vào khu đó (F1.6).
   *
   * - Gọi từ listener của HORSE_BARN_ASSIGNED_EVENT, tức SAU khi transaction xếp khu đã commit; không nhận EntityManager
   * - Người nhận: Head Trainer đang ACTIVE phụ trách khu; khu chưa có Head Trainer thì không gửi gì
   * - Idempotent theo notice.eventId: phát lại cùng event không sinh thông báo trùng
   * - Không tìm thấy ngựa hoặc khu (đã bị xóa) thì log cảnh báo và bỏ qua
   *
   * @param notice Payload của HORSE_BARN_ASSIGNED_EVENT: ngựa, khu mới và eventId chống trùng
   * @returns A promise resolving to danh sách id người nhận vừa được lưu mới (rỗng nếu không có ai để báo)
   */
  async notifyBarnAssigned(notice: HorseBarnAssignedEvent): Promise<string[]> {
    const [horseName, barn] = await Promise.all([
      this.recipients.findHorseName(notice.horseId),
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
      type: NotificationType.INFO,
      priority: NotificationPriority.NORMAL,
      title: 'Ngựa mới vào khu phụ trách',
      message: `Ngựa ${horseName} vừa được xếp vào khu "${barn.barnName}". Vui lòng xếp ô chuồng và đăng ký lớp huấn luyện nếu cần.`,
    });
  }

  /**
   * Báo Groom khi phân công chăm ngựa thay đổi (F1.7: Groom là actor nhận thông báo).
   *
   * - Groom mới nhận "được phân công chăm ngựa"; Groom cũ nhận "không còn phụ trách ngựa"
   * - Gọi từ listener của GROOM_ASSIGNMENT_CHANGED_EVENT, tức SAU khi transaction phân công đã commit; không nhận EntityManager
   * - Idempotent theo notice.eventId: gọi lại cùng eventId không sinh thông báo trùng
   * - Không tìm thấy ngựa thì log cảnh báo và bỏ qua
   *
   * @param notice Payload của GROOM_ASSIGNMENT_CHANGED_EVENT: ngựa, Groom mới, Groom cũ và eventId chống trùng
   * @returns A promise resolving to id những người nhận vừa được lưu mới
   */
  async notifyGroomChanged(
    notice: GroomAssignmentChangedEvent,
  ): Promise<string[]> {
    const horseName = await this.recipients.findHorseName(notice.horseId);
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
          type: NotificationType.INFO,
          priority: NotificationPriority.NORMAL,
          title: 'Phân công chăm ngựa mới',
          message: `Bạn được phân công chăm sóc ngựa ${horseName}. Công việc hằng ngày của ngựa này giờ thuộc về bạn.`,
        })),
      );
    }
    if (notice.previousGroomId) {
      sent.push(
        ...(await this.notifications.send({
          eventId: notice.eventId,
          recipientIds: [notice.previousGroomId],
          type: NotificationType.INFO,
          priority: NotificationPriority.NORMAL,
          title: 'Kết thúc phân công chăm ngựa',
          message: `Bạn không còn phụ trách ngựa ${horseName}. Bạn vẫn xem được hồ sơ nhưng không thao tác được trên con ngựa này.`,
        })),
      );
    }
    return sent;
  }

  /**
   * Báo Groom khi ngựa chuyển nhượng làm phân công chăm ngựa của họ tự kết thúc (F1.8, BA chốt 2026-09-23).
   *
   * - Gọi từ listener của HORSE_GROOM_RELEASED_BY_TRANSFER_EVENT, tức SAU khi transaction chuyển nhượng đã commit; không nhận EntityManager
   * - Idempotent theo notice.eventId
   * - Không tìm thấy ngựa thì log cảnh báo và bỏ qua
   *
   * @param notice Payload của HORSE_GROOM_RELEASED_BY_TRANSFER_EVENT: ngựa, Groom bị kết thúc phân công và eventId chống trùng
   * @returns A promise resolving to id những người nhận vừa được lưu mới
   */
  async notifyGroomReleasedByTransfer(
    notice: HorseGroomReleasedEvent,
  ): Promise<string[]> {
    const horseName = await this.recipients.findHorseName(notice.horseId);
    if (!horseName) {
      this.logger.warn(
        `Bỏ qua thông báo chuyển nhượng ${notice.eventId}: không tìm thấy ngựa ${notice.horseId}`,
      );
      return [];
    }
    return this.notifications.send({
      eventId: notice.eventId,
      recipientIds: [notice.groomId],
      type: NotificationType.INFO,
      priority: NotificationPriority.NORMAL,
      title: 'Ngựa đã chuyển nhượng',
      message: `Ngựa ${horseName} đã chuyển nhượng, bạn không còn phụ trách con ngựa này. Bạn vẫn xem được hồ sơ nhưng không thao tác được.`,
    });
  }
}

/**
 * Đổi mức độ cảnh báo chỉ số sang mức ưu tiên thông báo.
 *
 * @param severity The alert severity computed by the horses module
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
 * @param horseName The name of the horse
 * @param event The measurement alert event
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
        message: `Ngựa ${horseName} có thân nhiệt ${event.value} ${event.unit}, vượt ngưỡng sốt. Cần kiểm tra ngay.`,
      };
    case HorseMeasurementAlert.WEIGHT_DROP:
      return {
        title: `Cảnh báo: Ngựa ${horseName} giảm cân`,
        message: `Ngựa ${horseName} giảm ${event.dropPercent}% cân nặng trong ${WEIGHT_DROP_WINDOW_DAYS} ngày (từ ${event.baselineValue} ${event.unit} xuống ${event.value} ${event.unit}).`,
      };
  }
}

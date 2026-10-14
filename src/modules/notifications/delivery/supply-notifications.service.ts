import { Injectable } from '@nestjs/common';
import { UserRole } from '../../../common/enums/role.enum';
import { SupplyRequestStatus } from '../../supplies/enums/supply-request-status.enum';
import type {
  SupplyLowStockEvent,
  SupplyRequestCreatedEvent,
  SupplyRequestStatusChangedEvent,
} from '../../supplies/types/supply-events.types';
import { NotificationCategory } from '../enums/notification-category.enum';
import { NotificationPriority } from '../enums/notification-priority.enum';
import { NotificationDeliveryService } from './notification-delivery.service';
import { NotificationRecipientsRepository } from './notification-recipients.repository';

const STATUS_TITLES: Partial<Record<SupplyRequestStatus, string>> = {
  [SupplyRequestStatus.APPROVED]: 'Đề xuất bổ sung đã được duyệt',
  [SupplyRequestStatus.REJECTED]: 'Đề xuất bổ sung bị từ chối',
  [SupplyRequestStatus.FULFILLED]: 'Đề xuất bổ sung đã được cấp',
};

@Injectable()
export class SupplyNotificationsService {
  constructor(
    private readonly recipients: NotificationRecipientsRepository,
    private readonly notifications: NotificationDeliveryService,
  ) {}

  /**
   * Báo mọi Club Manager đang hoạt động khi có đề xuất bổ sung vật tư mới
   *
   * - Idempotent theo event.eventId
   *
   * @param event Payload của SUPPLY_REQUEST_CREATED_EVENT
   * @returns Promise trả về id những người nhận vừa được lưu mới
   */
  async notifyRequestCreated(
    event: SupplyRequestCreatedEvent,
  ): Promise<string[]> {
    return this.notifications.send({
      eventId: event.eventId,
      recipientIds: await this.recipients.findActiveUserIdsByRole(
        UserRole.CLUB_MANAGER,
      ),
      category: NotificationCategory.SUPPLY,
      priority: NotificationPriority.NORMAL,
      title: 'Đề xuất bổ sung vật tư mới',
      message: `${event.requesterName} đề xuất bổ sung ${event.quantity} ${event.unit} ${event.itemName}`,
      resource: null,
    });
  }

  /**
   * Báo người gửi khi đề xuất bổ sung được duyệt, bị từ chối hoặc được cấp
   *
   * - Từ chối: kèm lý do trong nội dung
   * - Idempotent theo event.eventId
   *
   * @param event Payload của SUPPLY_REQUEST_STATUS_CHANGED_EVENT
   * @returns Promise trả về id những người nhận vừa được lưu mới; trạng thái khác thì không gửi
   */
  async notifyRequestStatusChanged(
    event: SupplyRequestStatusChangedEvent,
  ): Promise<string[]> {
    const title = STATUS_TITLES[event.status];
    if (!title) return [];
    const subject = `${event.quantity} ${event.unit} ${event.itemName}`;
    return this.notifications.send({
      eventId: event.eventId,
      recipientIds: [event.requesterId],
      category: NotificationCategory.SUPPLY,
      priority: NotificationPriority.NORMAL,
      title,
      message: event.reason ? `${subject}. Lý do: ${event.reason}` : subject,
      resource: null,
    });
  }

  /**
   * Báo mọi Club Manager đang hoạt động khi số tồn của vật tư xuống tới hoặc dưới ngưỡng báo thiếu
   *
   * - Idempotent theo event.eventId
   *
   * @param event Payload của SUPPLY_LOW_STOCK_EVENT
   * @returns Promise trả về id những người nhận vừa được lưu mới
   */
  async notifyLowStock(event: SupplyLowStockEvent): Promise<string[]> {
    return this.notifications.send({
      eventId: event.eventId,
      recipientIds: await this.recipients.findActiveUserIdsByRole(
        UserRole.CLUB_MANAGER,
      ),
      category: NotificationCategory.SUPPLY,
      priority: NotificationPriority.HIGH,
      title: 'Vật tư sắp hết',
      message: `${event.itemName} còn ${event.quantityOnHand} ${event.unit}, ngưỡng báo thiếu ${event.reorderThreshold} ${event.unit}`,
      resource: null,
    });
  }
}

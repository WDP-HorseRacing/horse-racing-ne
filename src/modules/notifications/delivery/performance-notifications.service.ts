import { Injectable, Logger } from '@nestjs/common';
import { UserRole } from '../../../common/enums/role.enum';
import type { PerformanceMetricCriticalEvent } from '../../performance/types/performance.types';
import { NotificationCategory } from '../enums/notification-category.enum';
import { NotificationPriority } from '../enums/notification-priority.enum';
import { NotificationResourceType } from '../enums/notification-resource-type.enum';
import { NotificationDeliveryService } from './notification-delivery.service';
import { NotificationRecipientsRepository } from './notification-recipients.repository';

@Injectable()
export class PerformanceNotificationsService {
  private readonly logger = new Logger(PerformanceNotificationsService.name);

  constructor(
    private readonly recipients: NotificationRecipientsRepository,
    private readonly notifications: NotificationDeliveryService,
  ) {}

  /**
   * Báo khẩn khi nhịp tim của ngựa vượt ngưỡng nguy hiểm trong lượt tập
   *
   * - Người nhận: mọi Veterinarian đang ACTIVE và Head Trainer của lớp nếu còn ACTIVE với vai trò HEAD_TRAINER
   * - Mức ưu tiên URGENT, trỏ tới lượt tập
   * - Idempotent theo event.eventId: mỗi lượt tập chỉ có một thông báo
   * - Không tìm thấy ngựa thì log cảnh báo và bỏ qua
   *
   * @param event Payload của PERFORMANCE_METRIC_CRITICAL_EVENT
   * @returns Promise trả về danh sách id người nhận vừa được lưu mới
   */
  async notifyCriticalMetric(
    event: PerformanceMetricCriticalEvent,
  ): Promise<string[]> {
    const horse = await this.recipients.findHorseBarnContact(event.horseId);
    if (!horse) {
      this.logger.warn(
        `Bỏ qua cảnh báo thể lực của lượt tập ${event.sessionParticipantId}: không tìm thấy ngựa ${event.horseId}`,
      );
      return [];
    }
    const recipientIds = await this.recipients.findActiveUserIdsByRole(
      UserRole.VETERINARIAN,
    );
    if (
      event.headTrainerId &&
      (await this.recipients.isActiveUserWithRole(
        event.headTrainerId,
        UserRole.HEAD_TRAINER,
      ))
    ) {
      recipientIds.push(event.headTrainerId);
    }
    return this.notifications.send({
      eventId: event.eventId,
      recipientIds,
      category: NotificationCategory.PERFORMANCE_ALERT,
      priority: NotificationPriority.URGENT,
      title: `KHẨN: Ngựa ${horse.horseName} vượt ngưỡng thể lực`,
      message: `Ngựa ${horse.horseName} có nhịp tim ${event.heartRateBpm} bpm, tốc độ ${event.speedMps} m/s khi đang tập. Cần dừng bài tập và kiểm tra ngay.`,
      resource: {
        type: NotificationResourceType.SESSION_PARTICIPANT,
        id: event.sessionParticipantId,
        horseId: event.horseId,
      },
    });
  }
}

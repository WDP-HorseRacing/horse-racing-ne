import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { OUTBOX_LISTENER_OPTIONS } from '../../../../common/infrastructure/events/outbox-listener.options';
import { GROOM_ASSIGNMENT_CHANGED_EVENT } from '../../../stable/constants/stable-events.constants';
import type { GroomAssignmentChangedEvent } from '../../../stable/types/stable-events.types';
import { HorseNotificationsService } from '../services/horse-notifications.service';

@Injectable()
export class GroomAssignmentChangedListener {
  constructor(private readonly horseNotifications: HorseNotificationsService) {}

  /**
   * Nghe GROOM_ASSIGNMENT_CHANGED_EVENT và báo Groom mới, Groom cũ
   *
   * - Lỗi được ném ra để OutboxRelay giao lại event
   *
   * @param event Payload do module stable phát sau khi đổi phân công Groom
   * @returns Promise hoàn tất khi đã gửi xong
   */
  @OnEvent(GROOM_ASSIGNMENT_CHANGED_EVENT, OUTBOX_LISTENER_OPTIONS)
  async handle(event: GroomAssignmentChangedEvent): Promise<void> {
    await this.horseNotifications.notifyGroomChanged(event);
  }
}

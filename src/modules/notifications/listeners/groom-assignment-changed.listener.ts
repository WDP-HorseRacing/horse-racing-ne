import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { GROOM_ASSIGNMENT_CHANGED_EVENT } from '../../stable/constants/stable-events.constants';
import type { GroomAssignmentChangedEvent } from '../../stable/types/stable-events.types';
import { HorseNotificationsService } from '../services/horse-notifications.service';

@Injectable()
export class GroomAssignmentChangedListener {
  private readonly logger = new Logger(GroomAssignmentChangedListener.name);

  constructor(private readonly horseNotifications: HorseNotificationsService) {}

  /**
   * Nghe GROOM_ASSIGNMENT_CHANGED_EVENT và báo Groom mới, Groom cũ (F1.7)
   *
   * - Mọi lỗi đều được log rồi nuốt, không ném ngược về nơi phát event (phân công đã commit xong)
   *
   * @param event Payload do module stable phát sau khi đổi phân công Groom
   * @returns A promise resolving khi đã gửi xong hoặc đã log lỗi
   */
  @OnEvent(GROOM_ASSIGNMENT_CHANGED_EVENT, { async: true })
  async handle(event: GroomAssignmentChangedEvent): Promise<void> {
    try {
      await this.horseNotifications.notifyGroomChanged(event);
    } catch (error) {
      this.logger.error(
        `Gửi thông báo đổi Groom ${event.eventId} cho ngựa ${event.horseId} thất bại`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}

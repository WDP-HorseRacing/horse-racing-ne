import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { HORSE_BARN_ASSIGNED_EVENT } from '../../horses/constants/horse.constants';
import type { HorseBarnAssignedEvent } from '../../horses/types/horse.types';
import { HorseNotificationsService } from '../services/horse-notifications.service';

@Injectable()
export class HorseBarnAssignedListener {
  private readonly logger = new Logger(HorseBarnAssignedListener.name);

  constructor(private readonly horseNotifications: HorseNotificationsService) {}

  /**
   * Nghe HORSE_BARN_ASSIGNED_EVENT và báo Head Trainer của khu mới (F1.2, F1.6)
   *
   * - Mọi lỗi đều được log rồi nuốt, không ném ngược về nơi phát event (việc xếp khu đã commit xong)
   *
   * @param event Payload do module horses phát sau khi xếp khu
   * @returns A promise resolving khi đã gửi xong hoặc đã log lỗi
   */
  @OnEvent(HORSE_BARN_ASSIGNED_EVENT, { async: true })
  async handle(event: HorseBarnAssignedEvent): Promise<void> {
    try {
      await this.horseNotifications.notifyBarnAssigned(event);
    } catch (error) {
      this.logger.error(
        `Gửi thông báo xếp khu ${event.eventId} cho ngựa ${event.horseId} thất bại`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}

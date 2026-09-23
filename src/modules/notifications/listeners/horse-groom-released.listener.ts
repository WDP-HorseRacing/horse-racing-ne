import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { HORSE_GROOM_RELEASED_BY_TRANSFER_EVENT } from '../../horses/constants/horse.constants';
import type { HorseGroomReleasedEvent } from '../../horses/types/horse.types';
import { HorseNotificationsService } from '../services/horse-notifications.service';

@Injectable()
export class HorseGroomReleasedListener {
  private readonly logger = new Logger(HorseGroomReleasedListener.name);

  constructor(private readonly horseNotifications: HorseNotificationsService) {}

  /**
   * Nghe HORSE_GROOM_RELEASED_BY_TRANSFER_EVENT và báo Groom vừa bị kết thúc phân công do ngựa chuyển nhượng (F1.8)
   *
   * - Mọi lỗi đều được log rồi nuốt, không ném ngược về nơi phát event (việc chuyển nhượng đã commit xong)
   *
   * @param event Payload do module horses phát sau khi chuyển nhượng
   * @returns A promise resolving khi đã gửi xong hoặc đã log lỗi
   */
  @OnEvent(HORSE_GROOM_RELEASED_BY_TRANSFER_EVENT, { async: true })
  async handle(event: HorseGroomReleasedEvent): Promise<void> {
    try {
      await this.horseNotifications.notifyGroomReleasedByTransfer(event);
    } catch (error) {
      this.logger.error(
        `Gửi thông báo chuyển nhượng ${event.eventId} cho Groom của ngựa ${event.horseId} thất bại`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}

import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { OUTBOX_LISTENER_OPTIONS } from '../../../../common/infrastructure/events/outbox-listener.options';
import { HORSE_GROOM_RELEASED_BY_TRANSFER_EVENT } from '../../../horses/constants/horse.constants';
import type { HorseGroomReleasedEvent } from '../../../horses/types/horse.types';
import { HorseNotificationsService } from '../services/horse-notifications.service';

@Injectable()
export class HorseGroomReleasedListener {
  constructor(private readonly horseNotifications: HorseNotificationsService) {}

  /**
   * Nghe HORSE_GROOM_RELEASED_BY_TRANSFER_EVENT và báo Groom vừa bị kết thúc phân công do ngựa chuyển nhượng
   *
   * - Lỗi được ném ra để OutboxRelay giao lại event
   *
   * @param event Payload do module horses phát sau khi chuyển nhượng
   * @returns Promise hoàn tất khi đã gửi xong
   */
  @OnEvent(HORSE_GROOM_RELEASED_BY_TRANSFER_EVENT, OUTBOX_LISTENER_OPTIONS)
  async handle(event: HorseGroomReleasedEvent): Promise<void> {
    await this.horseNotifications.notifyGroomReleasedByTransfer(event);
  }
}

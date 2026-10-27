import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { OUTBOX_LISTENER_OPTIONS } from '../../../common/infrastructure/events/outbox.constants';
import { HORSE_DECEASED_EVENT } from '../../horses/constants/horse.constants';
import type { HorseDeceasedEvent } from '../../horses/types/horse.types';
import { HorseNotificationsService } from './horse-notifications.service';

@Injectable()
export class HorseDeceasedListener {
  constructor(private readonly horseNotifications: HorseNotificationsService) {}

  /**
   * Nghe HORSE_DECEASED_EVENT và báo những người liên quan rằng ngựa đã mất
   *
   * - Lỗi được ném ra để OutboxRelay giao lại event
   *
   * @param event Payload do module horses ghi vào outbox khi ghi nhận ngựa mất
   * @returns Promise hoàn tất khi đã gửi xong
   */
  @OnEvent(HORSE_DECEASED_EVENT, OUTBOX_LISTENER_OPTIONS)
  async handle(event: HorseDeceasedEvent): Promise<void> {
    await this.horseNotifications.notifyHorseDeceased(event);
  }
}

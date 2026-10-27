import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { OUTBOX_LISTENER_OPTIONS } from '../../../common/infrastructure/events/outbox.constants';
import { HORSE_LIFECYCLE_CHANGED_EVENT } from '../../horses/constants/horse.constants';
import type { HorseLifecycleChangedEvent } from '../../horses/types/horse.types';
import { HorseNotificationsService } from './horse-notifications.service';

@Injectable()
export class HorseLifecycleChangedListener {
  constructor(private readonly horseNotifications: HorseNotificationsService) {}

  /**
   * Nghe HORSE_LIFECYCLE_CHANGED_EVENT và báo chủ ngựa
   *
   * - Lỗi được ném ra để OutboxRelay giao lại event
   *
   * @param event Payload do module horses ghi vào outbox khi đổi vòng đời
   * @returns Promise hoàn tất khi đã gửi xong
   */
  @OnEvent(HORSE_LIFECYCLE_CHANGED_EVENT, OUTBOX_LISTENER_OPTIONS)
  async handle(event: HorseLifecycleChangedEvent): Promise<void> {
    await this.horseNotifications.notifyLifecycleChanged(event);
  }
}

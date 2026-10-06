import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { OUTBOX_LISTENER_OPTIONS } from '../../../../common/infrastructure/events/outbox-listener.options';
import { HORSE_BARN_ASSIGNED_EVENT } from '../../../horses/constants/horse.constants';
import type { HorseBarnAssignedEvent } from '../../../horses/types/horse.types';
import { HorseNotificationsService } from '../services/horse-notifications.service';

@Injectable()
export class HorseBarnAssignedListener {
  constructor(private readonly horseNotifications: HorseNotificationsService) {}

  /**
   * Nghe HORSE_BARN_ASSIGNED_EVENT và báo Head Trainer của khu mới
   *
   * - Lỗi được ném ra để OutboxRelay giao lại event
   *
   * @param event Payload do module horses phát sau khi xếp khu
   * @returns Promise hoàn tất khi đã gửi xong
   */
  @OnEvent(HORSE_BARN_ASSIGNED_EVENT, OUTBOX_LISTENER_OPTIONS)
  async handle(event: HorseBarnAssignedEvent): Promise<void> {
    await this.horseNotifications.notifyBarnAssigned(event);
  }
}

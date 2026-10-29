import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { OUTBOX_LISTENER_OPTIONS } from '../../../../../common/infrastructure/events/outbox.constants';
import { STALL_HORSE_MOVED_EVENT } from '../../../../stable/constants/stable-events.constants';
import type { StallHorseMovedEvent } from '../../../../stable/types/stable-events.types';
import { HorseNotificationsService } from '../../horses/horse-notifications.service';

@Injectable()
export class StallHorseMovedListener {
  constructor(private readonly horseNotifications: HorseNotificationsService) {}

  /**
   * Nghe STALL_HORSE_MOVED_EVENT và báo Groom đang phụ trách ngựa về ô chuồng mới
   *
   * - Lỗi được ném ra ngoài
   *
   * @param event Payload do module stable phát khi xếp hoặc chuyển ô
   * @returns Promise hoàn tất khi đã gửi xong
   */
  @OnEvent(STALL_HORSE_MOVED_EVENT, OUTBOX_LISTENER_OPTIONS)
  async handle(event: StallHorseMovedEvent): Promise<void> {
    await this.horseNotifications.notifyStallMoved(event);
  }
}

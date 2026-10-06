import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { OUTBOX_LISTENER_OPTIONS } from '../../../common/infrastructure/events/outbox.constants';
import { HORSE_OWNERSHIP_TRANSFERRED_EVENT } from '../../horses/constants/horse.constants';
import type { HorseOwnershipTransferredEvent } from '../../horses/types/horse.types';
import { HorseNotificationsService } from './horse-notifications.service';

@Injectable()
export class HorseOwnershipTransferredListener {
  constructor(private readonly horseNotifications: HorseNotificationsService) {}

  /**
   * Nghe HORSE_OWNERSHIP_TRANSFERRED_EVENT và báo chủ cũ, chủ mới
   *
   * - Lỗi được ném ra để OutboxRelay giao lại event
   *
   * @param event Payload do module horses ghi vào outbox khi chuyển nhượng nội bộ
   * @returns Promise hoàn tất khi đã gửi xong
   */
  @OnEvent(HORSE_OWNERSHIP_TRANSFERRED_EVENT, OUTBOX_LISTENER_OPTIONS)
  async handle(event: HorseOwnershipTransferredEvent): Promise<void> {
    await this.horseNotifications.notifyOwnershipTransferred(event);
  }
}

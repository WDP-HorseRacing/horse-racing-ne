import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { OUTBOX_LISTENER_OPTIONS } from '../../../../common/infrastructure/events/outbox.constants';
import { BILLING_SURCHARGE_ADDED_EVENT } from '../../../billing/constants/billing-events.constants';
import type { SurchargeAddedEvent } from '../../../billing/types/billing-events.types';
import { HorseNotificationsService } from '../horses/horse-notifications.service';

@Injectable()
export class SurchargeAddedListener {
  constructor(private readonly horseNotifications: HorseNotificationsService) {}

  /**
   * Nghe BILLING_SURCHARGE_ADDED_EVENT và báo Head Trainer khu của ngựa
   *
   * - Lỗi được ném ra ngoài
   *
   * @param event Payload do module billing phát khi ghi phụ phí
   * @returns Promise hoàn tất khi đã gửi xong
   */
  @OnEvent(BILLING_SURCHARGE_ADDED_EVENT, OUTBOX_LISTENER_OPTIONS)
  async handle(event: SurchargeAddedEvent): Promise<void> {
    await this.horseNotifications.notifySurchargeAdded(event);
  }
}

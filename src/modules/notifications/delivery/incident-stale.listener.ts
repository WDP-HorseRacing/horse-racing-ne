import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { OUTBOX_LISTENER_OPTIONS } from '../../../common/infrastructure/events/outbox.constants';
import { INCIDENT_STALE_EVENT } from '../../stable/constants/stable-events.constants';
import type { IncidentStaleEvent } from '../../stable/types/stable-events.types';
import { HorseNotificationsService } from './horse-notifications.service';

@Injectable()
export class IncidentStaleListener {
  constructor(private readonly horseNotifications: HorseNotificationsService) {}

  /**
   * Nghe INCIDENT_STALE_EVENT và nhắc Head Trainer của khu cùng Club Manager
   *
   * - Lỗi được ném ra ngoài
   *
   * @param event Payload do module stable phát khi sự cố quá hạn
   * @returns Promise hoàn tất khi đã gửi xong
   */
  @OnEvent(INCIDENT_STALE_EVENT, OUTBOX_LISTENER_OPTIONS)
  async handle(event: IncidentStaleEvent): Promise<void> {
    await this.horseNotifications.notifyIncidentStale(event);
  }
}

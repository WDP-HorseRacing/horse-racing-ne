import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { OUTBOX_LISTENER_OPTIONS } from '../../../common/infrastructure/events/outbox.constants';
import { INCIDENT_REPORTED_EVENT } from '../../stable/constants/stable-events.constants';
import type { IncidentReportedEvent } from '../../stable/types/stable-events.types';
import { HorseNotificationsService } from './horse-notifications.service';

@Injectable()
export class IncidentReportedListener {
  constructor(private readonly horseNotifications: HorseNotificationsService) {}

  /**
   * Nghe INCIDENT_REPORTED_EVENT và báo Head Trainer của khu chứa ngựa
   *
   * - Lỗi được ném ra ngoài
   *
   * @param event Payload do module stable phát khi Groom báo sự cố
   * @returns Promise hoàn tất khi đã gửi xong
   */
  @OnEvent(INCIDENT_REPORTED_EVENT, OUTBOX_LISTENER_OPTIONS)
  async handle(event: IncidentReportedEvent): Promise<void> {
    await this.horseNotifications.notifyIncidentReported(event);
  }
}

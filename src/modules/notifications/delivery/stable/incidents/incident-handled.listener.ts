import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { OUTBOX_LISTENER_OPTIONS } from '../../../../../common/infrastructure/events/outbox.constants';
import { INCIDENT_HANDLED_EVENT } from '../../../../stable/constants/stable-events.constants';
import type { IncidentHandledEvent } from '../../../../stable/types/stable-events.types';
import { HorseNotificationsService } from '../../horses/horse-notifications.service';

@Injectable()
export class IncidentHandledListener {
  constructor(private readonly horseNotifications: HorseNotificationsService) {}

  /**
   * Nghe INCIDENT_HANDLED_EVENT và báo người báo sự cố cùng Groom đang phụ trách ngựa
   *
   * - Lỗi được ném ra ngoài
   *
   * @param event Payload do module stable phát khi chuyển bác sĩ hoặc đóng sự cố
   * @returns Promise hoàn tất khi đã gửi xong
   */
  @OnEvent(INCIDENT_HANDLED_EVENT, OUTBOX_LISTENER_OPTIONS)
  async handle(event: IncidentHandledEvent): Promise<void> {
    await this.horseNotifications.notifyIncidentHandled(event);
  }
}

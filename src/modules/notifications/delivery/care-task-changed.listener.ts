import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { OUTBOX_LISTENER_OPTIONS } from '../../../common/infrastructure/events/outbox.constants';
import { CARE_TASK_CHANGED_EVENT } from '../../stable/constants/stable-events.constants';
import type { CareTaskChangedEvent } from '../../stable/types/stable-events.types';
import { HorseNotificationsService } from './horse-notifications.service';

@Injectable()
export class CareTaskChangedListener {
  constructor(private readonly horseNotifications: HorseNotificationsService) {}

  /**
   * Nghe CARE_TASK_CHANGED_EVENT và báo Head Trainer của khu chứa ngựa
   *
   * - Lỗi được ném ra ngoài
   *
   * @param event Payload do module stable phát khi bác sĩ đổi việc riêng của ngựa
   * @returns Promise hoàn tất khi đã gửi xong
   */
  @OnEvent(CARE_TASK_CHANGED_EVENT, OUTBOX_LISTENER_OPTIONS)
  async handle(event: CareTaskChangedEvent): Promise<void> {
    await this.horseNotifications.notifyCareTaskChanged(event);
  }
}

import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { OUTBOX_LISTENER_OPTIONS } from '../../../../../common/infrastructure/events/outbox.constants';
import {
  CHECKLIST_GENERATION_FAILED_EVENT,
  CHECKLIST_GENERATION_RECOVERED_EVENT,
} from '../../../../stable/constants/stable-events.constants';
import type {
  ChecklistGenerationFailedEvent,
  ChecklistGenerationRecoveredEvent,
} from '../../../../stable/types/stable-events.types';
import { HorseNotificationsService } from '../../horses/horse-notifications.service';

@Injectable()
export class ChecklistGenerationListener {
  constructor(private readonly horseNotifications: HorseNotificationsService) {}

  /**
   * Nghe CHECKLIST_GENERATION_FAILED_EVENT và báo Club Manager
   *
   * - Lỗi được ném ra ngoài
   *
   * @param event Payload do module stable phát khi sinh checklist hôm nay còn lỗi
   * @returns Promise hoàn tất khi đã gửi xong
   */
  @OnEvent(CHECKLIST_GENERATION_FAILED_EVENT, OUTBOX_LISTENER_OPTIONS)
  async onFailed(event: ChecklistGenerationFailedEvent): Promise<void> {
    await this.horseNotifications.notifyChecklistGenerationFailed(event);
  }

  /**
   * Nghe CHECKLIST_GENERATION_RECOVERED_EVENT và báo Club Manager
   *
   * - Lỗi được ném ra ngoài
   *
   * @param event Payload do module stable phát khi checklist hôm nay đã đủ sau khi đã báo lỗi
   * @returns Promise hoàn tất khi đã gửi xong
   */
  @OnEvent(CHECKLIST_GENERATION_RECOVERED_EVENT, OUTBOX_LISTENER_OPTIONS)
  async onRecovered(event: ChecklistGenerationRecoveredEvent): Promise<void> {
    await this.horseNotifications.notifyChecklistGenerationRecovered(event);
  }
}

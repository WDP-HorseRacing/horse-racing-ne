import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { OUTBOX_LISTENER_OPTIONS } from '../../../common/infrastructure/events/outbox.constants';
import { CHECKLIST_TASK_ADDED_EVENT } from '../../stable/constants/stable-events.constants';
import type { ChecklistTaskAddedEvent } from '../../stable/types/stable-events.types';
import { HorseNotificationsService } from './horse-notifications.service';

@Injectable()
export class ChecklistTaskAddedListener {
  constructor(private readonly horseNotifications: HorseNotificationsService) {}

  /**
   * Nghe CHECKLIST_TASK_ADDED_EVENT và báo Groom của checklist
   *
   * - Lỗi được ném ra ngoài
   *
   * @param event Payload do module stable phát khi thêm việc vào checklist hôm nay
   * @returns Promise hoàn tất khi đã gửi xong
   */
  @OnEvent(CHECKLIST_TASK_ADDED_EVENT, OUTBOX_LISTENER_OPTIONS)
  async handle(event: ChecklistTaskAddedEvent): Promise<void> {
    await this.horseNotifications.notifyChecklistTaskAdded(event);
  }
}

import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { OUTBOX_LISTENER_OPTIONS } from '../../../../common/infrastructure/events/outbox.constants';
import { TRAINING_RUN_GROOM_ASSIGNED_EVENT } from '../../../training/constants/training-events.constants';
import type { TrainingRunGroomAssignedEvent } from '../../../training/types/training-session.types';
import { HorseNotificationsService } from '../horses/horse-notifications.service';

@Injectable()
export class TrainingRunGroomAssignedListener {
  constructor(private readonly horseNotifications: HorseNotificationsService) {}

  /**
   * Nghe TRAINING_RUN_GROOM_ASSIGNED_EVENT và báo Groom vừa được giao dắt lượt tập
   *
   * - Lỗi được ném ra ngoài
   *
   * @param event Payload do module training phát khi giao người dắt
   * @returns Promise hoàn tất khi đã gửi xong
   */
  @OnEvent(TRAINING_RUN_GROOM_ASSIGNED_EVENT, OUTBOX_LISTENER_OPTIONS)
  async handle(event: TrainingRunGroomAssignedEvent): Promise<void> {
    await this.horseNotifications.notifyRunGroomAssigned(event);
  }
}

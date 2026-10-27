import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { OUTBOX_LISTENER_OPTIONS } from '../../../common/infrastructure/events/outbox.constants';
import { TRAINING_SESSION_CANCELLED_EVENT } from '../../training/constants/training-events.constants';
import type { TrainingSessionCancelledEvent } from '../../training/types/training-session.types';
import { HorseNotificationsService } from './horse-notifications.service';

@Injectable()
export class TrainingSessionCancelledListener {
  constructor(private readonly horseNotifications: HorseNotificationsService) {}

  /**
   * Nghe TRAINING_SESSION_CANCELLED_EVENT và báo người dắt từng ngựa
   *
   * - Lỗi được ném ra ngoài
   *
   * @param event Payload do module training phát khi hủy buổi tập
   * @returns Promise hoàn tất khi đã gửi xong
   */
  @OnEvent(TRAINING_SESSION_CANCELLED_EVENT, OUTBOX_LISTENER_OPTIONS)
  async handle(event: TrainingSessionCancelledEvent): Promise<void> {
    await this.horseNotifications.notifySessionCancelled(event);
  }
}

import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { OUTBOX_LISTENER_OPTIONS } from '../../../../common/infrastructure/events/outbox-listener.options';
import { HORSE_MEASUREMENT_ALERT_EVENT } from '../../../horses/constants/horse.constants';
import { HorseMeasurementSource } from '../../../horses/enums/horse-measurement-source.enum';
import type { HorseMeasurementAlertEvent } from '../../../horses/types/horse.types';
import { HorseNotificationsService } from '../services/horse-notifications.service';

@Injectable()
export class HorseMeasurementAlertListener {
  constructor(private readonly horseNotifications: HorseNotificationsService) {}

  /**
   * Nghe HORSE_MEASUREMENT_ALERT_EVENT và gửi thông báo cho Veterinarian và Head Trainer của khu.
   *
   * - Bỏ qua số đo do bác sĩ ghi trong buổi khám (nguồn MEDICAL_EXAM)
   * - Lỗi được ném ra để OutboxRelay giao lại event
   *
   * @param event Event cảnh báo số đo do module horses phát
   * @returns Promise hoàn tất khi đã gửi xong
   */
  @OnEvent(HORSE_MEASUREMENT_ALERT_EVENT, OUTBOX_LISTENER_OPTIONS)
  async handle(event: HorseMeasurementAlertEvent): Promise<void> {
    if (event.source === HorseMeasurementSource.MEDICAL_EXAM) return;
    await this.horseNotifications.notifyMeasurementAlert(event);
  }
}

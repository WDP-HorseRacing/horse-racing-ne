import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { HORSE_MEASUREMENT_ALERT_EVENT } from '../../horses/constants/horse.constants';
import type { HorseMeasurementAlertEvent } from '../../horses/types/horse.types';
import { HorseNotificationsService } from '../services/horse-notifications.service';

@Injectable()
export class HorseMeasurementAlertListener {
  private readonly logger = new Logger(HorseMeasurementAlertListener.name);

  constructor(private readonly horseNotifications: HorseNotificationsService) {}

  /**
   * Nghe HORSE_MEASUREMENT_ALERT_EVENT và gửi thông báo cho Veterinarian và Head Trainer của khu.
   *
   * - Mọi lỗi đều được log rồi nuốt, không ném ngược về nơi phát event (bản ghi đo đã commit xong)
   *
   * @param event The measurement alert event published by the horses module
   * @returns A promise resolving when the notification attempt has finished
   */
  @OnEvent(HORSE_MEASUREMENT_ALERT_EVENT, { async: true })
  async handle(event: HorseMeasurementAlertEvent): Promise<void> {
    try {
      await this.horseNotifications.notifyMeasurementAlert(event);
    } catch (error) {
      this.logger.error(
        `Gửi thông báo cảnh báo ${event.alert} cho bản ghi ${event.measurementId} thất bại`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}

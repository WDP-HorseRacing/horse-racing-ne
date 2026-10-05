import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { HORSE_MEASUREMENT_ALERT_EVENT } from '../../../horses/constants/horse.constants';
import { HorseMeasurementSource } from '../../../horses/enums/horse-measurement-source.enum';
import type { HorseMeasurementAlertEvent } from '../../../horses/types/horse.types';
import { HorseNotificationsService } from '../services/horse-notifications.service';

@Injectable()
export class HorseMeasurementAlertListener {
  private readonly logger = new Logger(HorseMeasurementAlertListener.name);

  constructor(private readonly horseNotifications: HorseNotificationsService) {}

  /**
   * Nghe HORSE_MEASUREMENT_ALERT_EVENT và gửi thông báo cho Veterinarian và Head Trainer của khu.
   *
   * - Bỏ qua số đo do bác sĩ ghi trong buổi khám (nguồn MEDICAL_EXAM)
   * - Mọi lỗi đều được log rồi nuốt, không ném ngược về nơi phát event
   *
   * @param event Event cảnh báo số đo do module horses phát
   * @returns Promise hoàn tất khi đã gửi xong hoặc đã log lỗi
   */
  @OnEvent(HORSE_MEASUREMENT_ALERT_EVENT, { async: true })
  async handle(event: HorseMeasurementAlertEvent): Promise<void> {
    if (event.source === HorseMeasurementSource.MEDICAL_EXAM) return;
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

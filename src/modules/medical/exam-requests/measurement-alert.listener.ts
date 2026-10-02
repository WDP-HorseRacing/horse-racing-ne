import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { HORSE_MEASUREMENT_ALERT_EVENT } from '../../horses/constants/horse.constants';
import { HorseMeasurementSource } from '../../horses/enums/horse-measurement-source.enum';
import type { HorseMeasurementAlertEvent } from '../../horses/types/horse.types';
import { ExamRequestsService } from './exam-requests.service';

@Injectable()
export class MeasurementAlertExamRequestListener {
  private readonly logger = new Logger(
    MeasurementAlertExamRequestListener.name,
  );

  constructor(private readonly examRequests: ExamRequestsService) {}

  /**
   * Nghe HORSE_MEASUREMENT_ALERT_EVENT và tự sinh yêu cầu khám
   *
   * - Bỏ qua số đo lấy trong buổi khám
   * - Mọi lỗi đều được log rồi nuốt
   *
   * @param event Payload của cảnh báo chỉ số
   * @returns Promise hoàn tất khi đã xử lý xong
   */
  @OnEvent(HORSE_MEASUREMENT_ALERT_EVENT, { async: true })
  async handle(event: HorseMeasurementAlertEvent): Promise<void> {
    if (event.source === HorseMeasurementSource.MEDICAL_EXAM) return;
    try {
      await this.examRequests.createFromAlert(event);
    } catch (error) {
      this.logger.error(
        `Tạo yêu cầu khám từ cảnh báo ${event.alert} của bản ghi ${event.measurementId} thất bại`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}

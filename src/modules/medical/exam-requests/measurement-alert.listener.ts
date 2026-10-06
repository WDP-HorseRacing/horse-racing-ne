import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { OUTBOX_LISTENER_OPTIONS } from '../../../common/infrastructure/events/outbox-listener.options';
import { HORSE_MEASUREMENT_ALERT_EVENT } from '../../horses/constants/horse.constants';
import { HorseMeasurementSource } from '../../horses/enums/horse-measurement-source.enum';
import type { HorseMeasurementAlertEvent } from '../../horses/types/horse.types';
import { ExamRequestsService } from './exam-requests.service';

@Injectable()
export class MeasurementAlertExamRequestListener {
  constructor(private readonly examRequests: ExamRequestsService) {}

  /**
   * Nghe HORSE_MEASUREMENT_ALERT_EVENT và tự sinh yêu cầu khám
   *
   * - Bỏ qua số đo lấy trong buổi khám
   * - Lỗi được ném ra để OutboxRelay giao lại event
   *
   * @param event Payload của cảnh báo chỉ số
   * @returns Promise hoàn tất khi đã xử lý xong
   */
  @OnEvent(HORSE_MEASUREMENT_ALERT_EVENT, OUTBOX_LISTENER_OPTIONS)
  async handle(event: HorseMeasurementAlertEvent): Promise<void> {
    if (event.source === HorseMeasurementSource.MEDICAL_EXAM) return;
    await this.examRequests.createFromAlert(event);
  }
}

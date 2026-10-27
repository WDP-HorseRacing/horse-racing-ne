import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { OUTBOX_LISTENER_OPTIONS } from '../../../common/infrastructure/events/outbox.constants';
import {
  MEDICAL_EXAM_REQUEST_HANDLED_EVENT,
  MEDICAL_EXAM_REQUEST_REOPENED_EVENT,
} from '../../medical/constants/medical-events.constants';
import type {
  ExamRequestHandledEvent,
  ExamRequestReopenedEvent,
} from '../../medical/types/medical-events.types';
import { IncidentsService } from './incidents.service';

@Injectable()
export class IncidentExamRequestListener {
  constructor(private readonly incidents: IncidentsService) {}

  /**
   * Nghe MEDICAL_EXAM_REQUEST_HANDLED_EVENT và đóng sự cố sinh ra yêu cầu khám
   *
   * - Nhận lặp event không đóng lại lần hai vì sự cố đã RESOLVED
   * - Lỗi được ném ra để OutboxRelay giao lại event
   *
   * @param event Payload của event
   * @returns Promise hoàn tất khi đã xử lý
   */
  @OnEvent(MEDICAL_EXAM_REQUEST_HANDLED_EVENT, OUTBOX_LISTENER_OPTIONS)
  async handle(event: ExamRequestHandledEvent): Promise<void> {
    await this.incidents.resolveFromExam(event);
  }

  /**
   * Nghe MEDICAL_EXAM_REQUEST_REOPENED_EVENT và mở lại sự cố đã tự đóng theo yêu cầu khám đó
   *
   * - Nhận lặp event không mở lại lần hai vì sự cố đã OPEN
   * - Lỗi được ném ra để OutboxRelay giao lại event
   *
   * @param event Payload của event
   * @returns Promise hoàn tất khi đã xử lý
   */
  @OnEvent(MEDICAL_EXAM_REQUEST_REOPENED_EVENT, OUTBOX_LISTENER_OPTIONS)
  async handleReopened(event: ExamRequestReopenedEvent): Promise<void> {
    await this.incidents.reopenFromExam(event);
  }
}

import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { OUTBOX_LISTENER_OPTIONS } from '../../../common/infrastructure/events/outbox.constants';
import {
  MEDICAL_CARE_SCHEDULE_DUE_EVENT,
  MEDICAL_CASE_CANCELLED_EVENT,
  MEDICAL_CASE_CLOSED_EVENT,
  MEDICAL_CASE_COST_ADJUSTED_EVENT,
  MEDICAL_CASE_OPENED_EVENT,
  MEDICAL_CHECKUP_OVERDUE_EVENT,
  MEDICAL_EXAM_REQUEST_URGENT_EVENT,
  MEDICAL_HEALTH_CHANGED_EVENT,
  MEDICAL_TRAINING_LOCK_RELEASED_EVENT,
  MEDICAL_TRAINING_LOCK_SET_EVENT,
} from '../../medical/constants/medical-events.constants';
import type {
  CareScheduleDueEvent,
  CheckupOverdueEvent,
  ExamRequestUrgentEvent,
  HealthChangedEvent,
  MedicalCaseCancelledEvent,
  MedicalCaseClosedEvent,
  MedicalCaseCostAdjustedEvent,
  MedicalCaseOpenedEvent,
  TrainingLockReleasedEvent,
  TrainingLockSetEvent,
} from '../../medical/types/medical-events.types';
import { MedicalNotificationsService } from './medical-notifications.service';

@Injectable()
export class MedicalEventsListener {
  constructor(private readonly medical: MedicalNotificationsService) {}

  /**
   * Nghe MEDICAL_EXAM_REQUEST_URGENT_EVENT và báo Veterinarian
   *
   * @param event Payload của event
   * @returns Promise hoàn tất khi đã gửi xong
   */
  @OnEvent(MEDICAL_EXAM_REQUEST_URGENT_EVENT, OUTBOX_LISTENER_OPTIONS)
  async onUrgentExamRequest(event: ExamRequestUrgentEvent): Promise<void> {
    await this.medical.notifyUrgentExamRequest(event);
  }

  /**
   * Nghe MEDICAL_TRAINING_LOCK_SET_EVENT và báo Head Trainer, Club Manager
   *
   * @param event Payload của event
   * @returns Promise hoàn tất khi đã gửi xong
   */
  @OnEvent(MEDICAL_TRAINING_LOCK_SET_EVENT, OUTBOX_LISTENER_OPTIONS)
  async onLockSet(event: TrainingLockSetEvent): Promise<void> {
    await this.medical.notifyLockSet(event);
  }

  /**
   * Nghe MEDICAL_TRAINING_LOCK_RELEASED_EVENT và báo Head Trainer, Club Manager
   *
   * @param event Payload của event
   * @returns Promise hoàn tất khi đã gửi xong
   */
  @OnEvent(MEDICAL_TRAINING_LOCK_RELEASED_EVENT, OUTBOX_LISTENER_OPTIONS)
  async onLockReleased(event: TrainingLockReleasedEvent): Promise<void> {
    await this.medical.notifyLockReleased(event);
  }

  /**
   * Nghe MEDICAL_HEALTH_CHANGED_EVENT và báo khi ngựa chuyển sang Chấn thương, Cách ly hoặc Cần theo dõi
   *
   * @param event Payload của event
   * @returns Promise hoàn tất khi đã gửi xong
   */
  @OnEvent(MEDICAL_HEALTH_CHANGED_EVENT, OUTBOX_LISTENER_OPTIONS)
  async onHealthChanged(event: HealthChangedEvent): Promise<void> {
    await this.medical.notifyHealthChanged(event);
  }

  /**
   * Nghe MEDICAL_CASE_OPENED_EVENT và báo Club Manager, chủ ngựa
   *
   * @param event Payload của event
   * @returns Promise hoàn tất khi đã gửi xong
   */
  @OnEvent(MEDICAL_CASE_OPENED_EVENT, OUTBOX_LISTENER_OPTIONS)
  async onCaseOpened(event: MedicalCaseOpenedEvent): Promise<void> {
    await this.medical.notifyCaseOpened(event);
  }

  /**
   * Nghe MEDICAL_CASE_CLOSED_EVENT và báo chủ ngựa, Club Manager
   *
   * @param event Payload của event
   * @returns Promise hoàn tất khi đã gửi xong
   */
  @OnEvent(MEDICAL_CASE_CLOSED_EVENT, OUTBOX_LISTENER_OPTIONS)
  async onCaseClosed(event: MedicalCaseClosedEvent): Promise<void> {
    await this.medical.notifyCaseClosed(event);
  }

  /**
   * Nghe MEDICAL_CASE_CANCELLED_EVENT và báo Club Manager, chủ ngựa
   *
   * @param event Payload của event
   * @returns Promise hoàn tất khi đã gửi xong
   */
  @OnEvent(MEDICAL_CASE_CANCELLED_EVENT, OUTBOX_LISTENER_OPTIONS)
  async onCaseCancelled(event: MedicalCaseCancelledEvent): Promise<void> {
    await this.medical.notifyCaseCancelled(event);
  }

  /**
   * Nghe MEDICAL_CASE_COST_ADJUSTED_EVENT và báo chủ ngựa, Club Manager
   *
   * @param event Payload của event
   * @returns Promise hoàn tất khi đã gửi xong
   */
  @OnEvent(MEDICAL_CASE_COST_ADJUSTED_EVENT, OUTBOX_LISTENER_OPTIONS)
  async onCaseCostAdjusted(event: MedicalCaseCostAdjustedEvent): Promise<void> {
    await this.medical.notifyCaseCostAdjusted(event);
  }

  /**
   * Nghe MEDICAL_CHECKUP_OVERDUE_EVENT và báo Veterinarian, Club Manager
   *
   * @param event Payload của event
   * @returns Promise hoàn tất khi đã gửi xong
   */
  @OnEvent(MEDICAL_CHECKUP_OVERDUE_EVENT, OUTBOX_LISTENER_OPTIONS)
  async onCheckupOverdue(event: CheckupOverdueEvent): Promise<void> {
    await this.medical.notifyCheckupOverdue(event);
  }

  /**
   * Nghe MEDICAL_CARE_SCHEDULE_DUE_EVENT và báo Veterinarian, người được giao
   *
   * @param event Payload của event
   * @returns Promise hoàn tất khi đã gửi xong
   */
  @OnEvent(MEDICAL_CARE_SCHEDULE_DUE_EVENT, OUTBOX_LISTENER_OPTIONS)
  async onCareScheduleDue(event: CareScheduleDueEvent): Promise<void> {
    await this.medical.notifyCareScheduleDue(event);
  }
}

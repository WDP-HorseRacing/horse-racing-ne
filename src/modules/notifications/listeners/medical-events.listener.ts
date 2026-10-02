import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
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
import { MedicalNotificationsService } from '../services/medical-notifications.service';

@Injectable()
export class MedicalEventsListener {
  private readonly logger = new Logger(MedicalEventsListener.name);

  constructor(private readonly medical: MedicalNotificationsService) {}

  /**
   * Nghe MEDICAL_EXAM_REQUEST_URGENT_EVENT và báo Veterinarian
   *
   * @param event Payload của event
   * @returns Promise hoàn tất khi đã gửi xong hoặc đã log lỗi
   */
  @OnEvent(MEDICAL_EXAM_REQUEST_URGENT_EVENT, { async: true })
  onUrgentExamRequest(event: ExamRequestUrgentEvent): Promise<void> {
    return this.safely(event.eventId, () =>
      this.medical.notifyUrgentExamRequest(event),
    );
  }

  /**
   * Nghe MEDICAL_TRAINING_LOCK_SET_EVENT và báo Head Trainer, Club Manager
   *
   * @param event Payload của event
   * @returns Promise hoàn tất khi đã gửi xong hoặc đã log lỗi
   */
  @OnEvent(MEDICAL_TRAINING_LOCK_SET_EVENT, { async: true })
  onLockSet(event: TrainingLockSetEvent): Promise<void> {
    return this.safely(event.eventId, () => this.medical.notifyLockSet(event));
  }

  /**
   * Nghe MEDICAL_TRAINING_LOCK_RELEASED_EVENT và báo Head Trainer, Club Manager
   *
   * @param event Payload của event
   * @returns Promise hoàn tất khi đã gửi xong hoặc đã log lỗi
   */
  @OnEvent(MEDICAL_TRAINING_LOCK_RELEASED_EVENT, { async: true })
  onLockReleased(event: TrainingLockReleasedEvent): Promise<void> {
    return this.safely(event.eventId, () =>
      this.medical.notifyLockReleased(event),
    );
  }

  /**
   * Nghe MEDICAL_HEALTH_CHANGED_EVENT và báo khi ngựa chuyển sang Chấn thương, Cách ly hoặc Cần theo dõi
   *
   * @param event Payload của event
   * @returns Promise hoàn tất khi đã gửi xong hoặc đã log lỗi
   */
  @OnEvent(MEDICAL_HEALTH_CHANGED_EVENT, { async: true })
  onHealthChanged(event: HealthChangedEvent): Promise<void> {
    return this.safely(event.eventId, () =>
      this.medical.notifyHealthChanged(event),
    );
  }

  /**
   * Nghe MEDICAL_CASE_OPENED_EVENT và báo Club Manager, chủ ngựa
   *
   * @param event Payload của event
   * @returns Promise hoàn tất khi đã gửi xong hoặc đã log lỗi
   */
  @OnEvent(MEDICAL_CASE_OPENED_EVENT, { async: true })
  onCaseOpened(event: MedicalCaseOpenedEvent): Promise<void> {
    return this.safely(event.eventId, () =>
      this.medical.notifyCaseOpened(event),
    );
  }

  /**
   * Nghe MEDICAL_CASE_CLOSED_EVENT và báo chủ ngựa, Club Manager
   *
   * @param event Payload của event
   * @returns Promise hoàn tất khi đã gửi xong hoặc đã log lỗi
   */
  @OnEvent(MEDICAL_CASE_CLOSED_EVENT, { async: true })
  onCaseClosed(event: MedicalCaseClosedEvent): Promise<void> {
    return this.safely(event.eventId, () =>
      this.medical.notifyCaseClosed(event),
    );
  }

  /**
   * Nghe MEDICAL_CASE_CANCELLED_EVENT và báo Club Manager, chủ ngựa
   *
   * @param event Payload của event
   * @returns Promise hoàn tất khi đã gửi xong hoặc đã log lỗi
   */
  @OnEvent(MEDICAL_CASE_CANCELLED_EVENT, { async: true })
  onCaseCancelled(event: MedicalCaseCancelledEvent): Promise<void> {
    return this.safely(event.eventId, () =>
      this.medical.notifyCaseCancelled(event),
    );
  }

  /**
   * Nghe MEDICAL_CASE_COST_ADJUSTED_EVENT và báo chủ ngựa, Club Manager
   *
   * @param event Payload của event
   * @returns Promise hoàn tất khi đã gửi xong hoặc đã log lỗi
   */
  @OnEvent(MEDICAL_CASE_COST_ADJUSTED_EVENT, { async: true })
  onCaseCostAdjusted(event: MedicalCaseCostAdjustedEvent): Promise<void> {
    return this.safely(event.eventId, () =>
      this.medical.notifyCaseCostAdjusted(event),
    );
  }

  /**
   * Nghe MEDICAL_CHECKUP_OVERDUE_EVENT và báo Veterinarian, Club Manager
   *
   * @param event Payload của event
   * @returns Promise hoàn tất khi đã gửi xong hoặc đã log lỗi
   */
  @OnEvent(MEDICAL_CHECKUP_OVERDUE_EVENT, { async: true })
  onCheckupOverdue(event: CheckupOverdueEvent): Promise<void> {
    return this.safely(event.eventId, () =>
      this.medical.notifyCheckupOverdue(event),
    );
  }

  /**
   * Nghe MEDICAL_CARE_SCHEDULE_DUE_EVENT và báo Veterinarian, người được giao
   *
   * @param event Payload của event
   * @returns Promise hoàn tất khi đã gửi xong hoặc đã log lỗi
   */
  @OnEvent(MEDICAL_CARE_SCHEDULE_DUE_EVENT, { async: true })
  onCareScheduleDue(event: CareScheduleDueEvent): Promise<void> {
    return this.safely(event.eventId, () =>
      this.medical.notifyCareScheduleDue(event),
    );
  }

  /**
   * Chạy việc gửi thông báo, lỗi được log rồi nuốt, không ném ra ngoài
   *
   * @param eventId Khóa của event, dùng trong log
   * @param send Việc gửi thông báo
   * @returns Promise hoàn tất khi đã gửi xong hoặc đã log lỗi
   */
  private async safely(
    eventId: string,
    send: () => Promise<unknown>,
  ): Promise<void> {
    try {
      await send();
    } catch (error) {
      this.logger.error(
        `Gửi thông báo y tế ${eventId} thất bại`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}

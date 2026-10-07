import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { OUTBOX_LISTENER_OPTIONS } from '../../../common/infrastructure/events/outbox.constants';
import { PERFORMANCE_METRIC_CRITICAL_EVENT } from '../../performance/constants/performance.constants';
import type { PerformanceMetricCriticalEvent } from '../../performance/types/performance.types';
import { PerformanceNotificationsService } from './performance-notifications.service';

@Injectable()
export class PerformanceMetricCriticalListener {
  constructor(
    private readonly performanceNotifications: PerformanceNotificationsService,
  ) {}

  /**
   * Nghe PERFORMANCE_METRIC_CRITICAL_EVENT và báo khẩn cho bác sĩ và Head Trainer của lớp
   *
   * - Lỗi được ném ra để OutboxRelay giao lại event
   *
   * @param event Payload do module performance ghi vào outbox khi có điểm đo CRITICAL
   * @returns Promise hoàn tất khi đã gửi xong
   */
  @OnEvent(PERFORMANCE_METRIC_CRITICAL_EVENT, OUTBOX_LISTENER_OPTIONS)
  async handle(event: PerformanceMetricCriticalEvent): Promise<void> {
    await this.performanceNotifications.notifyCriticalMetric(event);
  }
}

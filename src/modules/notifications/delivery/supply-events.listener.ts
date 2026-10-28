import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { OUTBOX_LISTENER_OPTIONS } from '../../../common/infrastructure/events/outbox.constants';
import {
  SUPPLY_LOW_STOCK_EVENT,
  SUPPLY_REQUEST_CREATED_EVENT,
  SUPPLY_REQUEST_STATUS_CHANGED_EVENT,
} from '../../supplies/constants/supply-events.constants';
import type {
  SupplyLowStockEvent,
  SupplyRequestCreatedEvent,
  SupplyRequestStatusChangedEvent,
} from '../../supplies/types/supply-events.types';
import { SupplyNotificationsService } from './supply-notifications.service';

@Injectable()
export class SupplyEventsListener {
  constructor(
    private readonly supplyNotifications: SupplyNotificationsService,
  ) {}

  /**
   * Nghe SUPPLY_REQUEST_CREATED_EVENT và báo Club Manager
   *
   * - Lỗi được ném ra để OutboxRelay giao lại event
   *
   * @param event Payload do module supplies ghi vào outbox khi có đề xuất mới
   * @returns Promise hoàn tất khi đã gửi xong
   */
  @OnEvent(SUPPLY_REQUEST_CREATED_EVENT, OUTBOX_LISTENER_OPTIONS)
  async onRequestCreated(event: SupplyRequestCreatedEvent): Promise<void> {
    await this.supplyNotifications.notifyRequestCreated(event);
  }

  /**
   * Nghe SUPPLY_REQUEST_STATUS_CHANGED_EVENT và báo người gửi đề xuất
   *
   * - Lỗi được ném ra để OutboxRelay giao lại event
   *
   * @param event Payload do module supplies ghi vào outbox khi đề xuất đổi trạng thái
   * @returns Promise hoàn tất khi đã gửi xong
   */
  @OnEvent(SUPPLY_REQUEST_STATUS_CHANGED_EVENT, OUTBOX_LISTENER_OPTIONS)
  async onRequestStatusChanged(
    event: SupplyRequestStatusChangedEvent,
  ): Promise<void> {
    await this.supplyNotifications.notifyRequestStatusChanged(event);
  }

  /**
   * Nghe SUPPLY_LOW_STOCK_EVENT và báo Club Manager
   *
   * - Lỗi được ném ra để OutboxRelay giao lại event
   *
   * @param event Payload do module supplies ghi vào outbox khi vật tư xuống tới ngưỡng báo thiếu
   * @returns Promise hoàn tất khi đã gửi xong
   */
  @OnEvent(SUPPLY_LOW_STOCK_EVENT, OUTBOX_LISTENER_OPTIONS)
  async onLowStock(event: SupplyLowStockEvent): Promise<void> {
    await this.supplyNotifications.notifyLowStock(event);
  }
}

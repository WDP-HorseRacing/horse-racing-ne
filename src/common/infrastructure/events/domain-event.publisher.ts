import { Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { OutboxEventEntity } from './outbox-event.entity';

@Injectable()
export class DomainEventPublisher {
  /**
   * Ghi một domain event vào bảng outbox_events trong transaction của nghiệp vụ
   *
   * - Transaction commit thì event chắc chắn được OutboxRelayService giao cho các listener (ít nhất một lần); rollback thì event mất theo
   * - Payload lưu dạng JSON: chỉ dùng kiểu JSON được (chuỗi, số, boolean, null, mảng, object); thời điểm truyền dạng chuỗi ISO
   *
   * @param manager EntityManager của transaction đang chạy
   * @param name Tên event
   * @param payload Dữ liệu của event
   * @returns Promise hoàn tất khi đã ghi vào outbox
   */
  async publish(
    manager: EntityManager,
    name: string,
    payload: object,
  ): Promise<void> {
    await manager.insert(OutboxEventEntity, { eventName: name, payload });
  }
}

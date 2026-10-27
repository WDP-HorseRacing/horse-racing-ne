import { Column, Entity, Index } from 'typeorm';
import { BaseRecordEntity } from '../../database/base-record.entity';

/**
 * OutboxEventEntity: domain event chờ OutboxRelayService giao cho các listener.
 *
 * - Ghi trong cùng transaction với dữ liệu nghiệp vụ
 * - processedAt có giá trị: đã giao xong; deadAt có giá trị: đã ngừng thử sau OUTBOX_MAX_ATTEMPTS lần
 * - nextAttemptAt: thời điểm sớm nhất được nhận để giao (lần đầu, lần thử lại hoặc hết hạn giữ chỗ)
 */
@Entity({ name: 'outbox_events' })
@Index('outbox_events_pending_idx', ['nextAttemptAt'], {
  where: 'processed_at IS NULL AND dead_at IS NULL',
})
@Index('outbox_events_processed_idx', ['processedAt'], {
  where: 'processed_at IS NOT NULL',
})
export class OutboxEventEntity extends BaseRecordEntity {
  @Column({ name: 'event_name', type: 'varchar', length: 120 })
  eventName!: string;

  @Column({ type: 'jsonb' })
  payload!: object;

  @Column({
    name: 'next_attempt_at',
    type: 'timestamptz',
    default: () => 'now()',
  })
  nextAttemptAt!: Date;

  @Column({ type: 'int', default: 0 })
  attempts!: number;

  @Column({ name: 'processed_at', type: 'timestamptz', nullable: true })
  processedAt!: Date | null;

  @Column({ name: 'dead_at', type: 'timestamptz', nullable: true })
  deadAt!: Date | null;

  @Column({ name: 'last_error', type: 'text', nullable: true })
  lastError!: string | null;
}

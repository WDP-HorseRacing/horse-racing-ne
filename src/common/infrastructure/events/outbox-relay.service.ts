import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Cron, Interval } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import { OutboxEventEntity } from './outbox-event.entity';
import { OUTBOX_MAX_ATTEMPTS } from './outbox.constants';
import type { ClaimedOutboxEvent } from './types/outbox.types';

/**
 * Số event tối đa nhận trong một lượt.
 */
const BATCH_SIZE = 20;

/**
 * Thời gian (giây) một event được giữ cho relay đã nhận nó; hết khoảng này relay khác được nhận lại.
 */
const LEASE_SECONDS = 300;

/**
 * Độ trễ thử lại tối đa (giây).
 */
const MAX_BACKOFF_SECONDS = 3600;

/**
 * Số ngày giữ lại event đã giao xong trước khi dọn.
 */
const PROCESSED_RETENTION_DAYS = 7;

@Injectable()
export class OutboxRelayService {
  private readonly logger = new Logger(OutboxRelayService.name);
  private running = false;

  constructor(
    @InjectRepository(OutboxEventEntity)
    private readonly outbox: Repository<OutboxEventEntity>,
    private readonly emitter: EventEmitter2,
  ) {}

  /**
   * Mỗi giây giao các event đến hạn; lượt trước chưa xong thì bỏ qua lượt này
   *
   * - Lô vừa nhận đầy BATCH_SIZE thì nhận tiếp ngay trong cùng lượt
   * - Lỗi của cả lượt chỉ được log
   *
   * @returns Promise hoàn tất khi lượt giao kết thúc
   */
  @Interval(1000)
  async relayDueEvents(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      let claimed: number;
      do {
        claimed = await this.relayBatch();
      } while (claimed === BATCH_SIZE);
    } catch (error) {
      this.logger.error(
        'Lượt giao outbox thất bại',
        error instanceof Error ? error.stack : String(error),
      );
    } finally {
      this.running = false;
    }
  }

  /**
   * Nhận một lô event đến hạn rồi giao từng event cho các listener
   *
   * - Nhiều relay chạy song song không nhận trùng event
   * - Mọi listener chạy xong không lỗi: đánh dấu processedAt
   * - Có listener lỗi: lùi lần giao sau theo cấp số nhân (tối đa MAX_BACKOFF_SECONDS); đủ OUTBOX_MAX_ATTEMPTS lần thì đánh dấu deadAt
   *
   * @returns Promise trả về số event đã nhận trong lô
   */
  async relayBatch(): Promise<number> {
    const claimed = await this.claimDueEvents();
    for (const event of claimed) {
      await this.deliver(event);
    }
    return claimed.length;
  }

  /**
   * Dọn các event đã giao xong quá PROCESSED_RETENTION_DAYS ngày, chạy lúc 03:00 hằng ngày
   *
   * @returns Promise hoàn tất khi đã dọn
   */
  @Cron('0 3 * * *')
  async purgeProcessedEvents(): Promise<void> {
    await this.outbox.delete({
      processedAt: LessThan(
        new Date(Date.now() - PROCESSED_RETENTION_DAYS * 86_400_000),
      ),
    });
  }

  /**
   * Nhận tối đa BATCH_SIZE event đến hạn, cũ nhất trước, và giữ chỗ LEASE_SECONDS cho relay này
   *
   * - Dùng FOR UPDATE SKIP LOCKED: event relay khác đang nhận thì bỏ qua
   * - Mỗi lần nhận tăng attempts thêm 1
   *
   * @returns Promise trả về các event đã nhận
   */
  private async claimDueEvents(): Promise<ClaimedOutboxEvent[]> {
    const [rows] = await this.outbox.query<[ClaimedOutboxEvent[], number]>(
      `UPDATE outbox_events
          SET next_attempt_at = now() + make_interval(secs => $2),
              attempts = attempts + 1
        WHERE id IN (
          SELECT id FROM outbox_events
           WHERE processed_at IS NULL AND dead_at IS NULL
             AND next_attempt_at <= now()
           ORDER BY next_attempt_at, created_at
           LIMIT $1
           FOR UPDATE SKIP LOCKED)
      RETURNING id, event_name AS "eventName", payload, attempts`,
      [BATCH_SIZE, LEASE_SECONDS],
    );
    return rows;
  }

  /**
   * Giao một event cho mọi listener của nó rồi ghi kết quả
   *
   * @param event Event đã nhận
   * @returns Promise hoàn tất khi đã ghi kết quả giao
   */
  private async deliver(event: ClaimedOutboxEvent): Promise<void> {
    try {
      await this.emitter.emitAsync(event.eventName, event.payload);
      await this.outbox.update(event.id, {
        processedAt: () => 'now()',
        lastError: null,
      });
    } catch (error) {
      const message =
        error instanceof Error ? (error.stack ?? error.message) : String(error);
      const exhausted = event.attempts >= OUTBOX_MAX_ATTEMPTS;
      const backoffSeconds = Math.min(2 ** event.attempts, MAX_BACKOFF_SECONDS);
      await this.outbox.update(event.id, {
        lastError: message,
        deadAt: exhausted ? () => 'now()' : null,
        nextAttemptAt: () => `now() + make_interval(secs => ${backoffSeconds})`,
      });
      if (exhausted) {
        this.logger.error(
          `Event ${event.eventName} (${event.id}) giao thất bại ${event.attempts} lần, ngừng thử: ${message}`,
        );
      } else {
        this.logger.warn(
          `Event ${event.eventName} (${event.id}) giao thất bại lần ${event.attempts}, sẽ thử lại: ${message}`,
        );
      }
    }
  }
}

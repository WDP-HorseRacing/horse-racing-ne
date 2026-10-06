import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Cron, Interval } from '@nestjs/schedule';
import { DataSource } from 'typeorm';

/**
 * Một event đã được relay nhận để giao.
 */
interface ClaimedOutboxEvent {
  id: string;
  name: string;
  payload: unknown;
  attempts: number;
}

/**
 * Số event tối đa nhận trong một lượt.
 */
const BATCH_SIZE = 20;

/**
 * Số lần giao tối đa trước khi đánh dấu thất bại hẳn.
 */
export const OUTBOX_MAX_ATTEMPTS = 10;

/**
 * Thời gian (giây) một event bị giữ cho relay đã nhận nó; relay chết giữa chừng thì sau khoảng này relay khác nhận lại.
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
export class OutboxRelay {
  private readonly logger = new Logger(OutboxRelay.name);
  private running = false;

  constructor(
    private readonly dataSource: DataSource,
    private readonly emitter: EventEmitter2,
  ) {}

  /**
   * Mỗi giây giao các event đến hạn; lượt trước chưa xong thì bỏ qua lượt này
   *
   * @returns Promise hoàn tất khi lượt giao kết thúc
   */
  @Interval(1000)
  async tick(): Promise<void> {
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
   * - Nhận bằng FOR UPDATE SKIP LOCKED và giữ chỗ LEASE_SECONDS: nhiều relay chạy song song không nhận trùng
   * - Mọi listener chạy xong không lỗi: đánh dấu processed_at
   * - Có listener lỗi: lùi lần giao sau theo cấp số nhân (tối đa MAX_BACKOFF_SECONDS); đủ OUTBOX_MAX_ATTEMPTS lần thì đánh dấu failed_at
   *
   * @returns Promise trả về số event đã nhận trong lô
   */
  async relayBatch(): Promise<number> {
    const claimed = await this.claim();
    for (const event of claimed) {
      await this.dispatch(event);
    }
    return claimed.length;
  }

  /**
   * Dọn các event đã giao xong quá PROCESSED_RETENTION_DAYS ngày, chạy lúc 03:00 hằng ngày
   *
   * @returns Promise hoàn tất khi đã dọn
   */
  @Cron('0 3 * * *')
  async purgeProcessed(): Promise<void> {
    await this.dataSource.query(
      `DELETE FROM outbox_events
        WHERE processed_at < now() - make_interval(days => $1)`,
      [PROCESSED_RETENTION_DAYS],
    );
  }

  /**
   * Nhận tối đa BATCH_SIZE event đến hạn, cũ nhất trước, và giữ chỗ cho relay này
   *
   * @returns Promise trả về các event đã nhận
   */
  private async claim(): Promise<ClaimedOutboxEvent[]> {
    const [rows] = await this.dataSource.query<[ClaimedOutboxEvent[], number]>(
      `UPDATE outbox_events
          SET available_at = now() + make_interval(secs => $2),
              attempts = attempts + 1
        WHERE id IN (
          SELECT id FROM outbox_events
           WHERE processed_at IS NULL AND failed_at IS NULL
             AND available_at <= now()
           ORDER BY available_at, created_at
           LIMIT $1
           FOR UPDATE SKIP LOCKED)
      RETURNING id, name, payload, attempts`,
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
  private async dispatch(event: ClaimedOutboxEvent): Promise<void> {
    try {
      await this.emitter.emitAsync(event.name, event.payload);
      await this.dataSource.query(
        `UPDATE outbox_events SET processed_at = now(), last_error = NULL WHERE id = $1`,
        [event.id],
      );
    } catch (error) {
      const message =
        error instanceof Error ? (error.stack ?? error.message) : String(error);
      const exhausted = event.attempts >= OUTBOX_MAX_ATTEMPTS;
      await this.dataSource.query(
        `UPDATE outbox_events
            SET last_error = $2,
                failed_at = CASE WHEN $3 THEN now() ELSE NULL END,
                available_at = now() + make_interval(secs => $4)
          WHERE id = $1`,
        [
          event.id,
          message,
          exhausted,
          Math.min(2 ** event.attempts, MAX_BACKOFF_SECONDS),
        ],
      );
      if (exhausted) {
        this.logger.error(
          `Event ${event.name} (${event.id}) giao thất bại ${event.attempts} lần, ngừng thử: ${message}`,
        );
      } else {
        this.logger.warn(
          `Event ${event.name} (${event.id}) giao thất bại lần ${event.attempts}, sẽ thử lại: ${message}`,
        );
      }
    }
  }
}

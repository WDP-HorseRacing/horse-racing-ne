import type { OnEvent } from '@nestjs/event-emitter';

/**
 * Tùy chọn `@OnEvent` cho listener nhận event từ OutboxRelayService.
 *
 * - Lỗi của listener được ném về relay; relay giao lại event, nên listener phải chịu được việc nhận lặp một event
 * - Listener chạy ngay trong `emitAsync` của relay (không đẩy sang `setImmediate`)
 */
export const OUTBOX_LISTENER_OPTIONS: Parameters<typeof OnEvent>[1] = {
  suppressErrors: false,
};

/**
 * Số lần giao tối đa trước khi đánh dấu event là dead.
 */
export const OUTBOX_MAX_ATTEMPTS = 10;

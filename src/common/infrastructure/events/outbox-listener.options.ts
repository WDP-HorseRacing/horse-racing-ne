import type { OnEvent } from '@nestjs/event-emitter';

/**
 * Tùy chọn `@OnEvent` cho listener nhận event từ OutboxRelay.
 *
 * - Lỗi của listener được ném ngược về relay để relay giao lại event; listener vì vậy phải chịu được việc nhận lặp một event
 * - Chạy đồng bộ trong `emitAsync` của relay (không đẩy sang `setImmediate`) để relay đợi được kết quả
 */
export const OUTBOX_LISTENER_OPTIONS: Parameters<typeof OnEvent>[1] = {
  suppressErrors: false,
};

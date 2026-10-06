import type { SendResponse } from 'firebase-admin/messaging';
import type { PushFailureClassification } from '../types/notification.types';

/**
 * Mã lỗi FCM cho biết token không còn dùng được, cần xóa khỏi user_devices.
 */
export const FCM_DEAD_TOKEN_CODES = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
]);

/**
 * Mã lỗi FCM tạm thời, gửi lại sau có thể thành công.
 */
export const FCM_RETRYABLE_CODES = new Set([
  'messaging/server-unavailable',
  'messaging/internal-error',
  'messaging/message-rate-exceeded',
  'messaging/device-message-rate-exceeded',
  'messaging/unknown-error',
]);

/**
 * Phân loại các token gửi push lỗi theo mã lỗi FCM
 *
 * - Mã trong FCM_DEAD_TOKEN_CODES: token chết
 * - Mã trong FCM_RETRYABLE_CODES hoặc không có mã: gửi lại
 * - Mã khác: lỗi không thử lại
 * - Token gửi thành công không xuất hiện trong kết quả
 *
 * @param tokens Các token đã gửi, cùng thứ tự với responses
 * @param responses Kết quả gửi của từng token
 * @returns Danh sách token chết, token cần gửi lại và token lỗi khác
 */
export function classifyPushFailures(
  tokens: string[],
  responses: SendResponse[],
): PushFailureClassification {
  const result: PushFailureClassification = { dead: [], retry: [], failed: [] };
  responses.forEach((response, index) => {
    if (response.success) return;
    const token = tokens[index];
    const code = response.error?.code ?? 'messaging/unknown-error';
    if (FCM_DEAD_TOKEN_CODES.has(code)) {
      result.dead.push(token);
    } else if (FCM_RETRYABLE_CODES.has(code)) {
      result.retry.push(token);
    } else {
      result.failed.push({
        token,
        code,
        message: response.error?.message ?? '',
      });
    }
  });
  return result;
}

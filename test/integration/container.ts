const PORT_BINDING_TIMEOUT_MESSAGE =
  'while waiting for container ports to be bound to the host';
const MAX_START_ATTEMPTS = 3;

/**
 * Bật container, thử lại khi Docker gắn port ra máy chậm quá thời gian chờ cố định của testcontainers
 *
 * - Lỗi chờ gắn port: bật lại, tối đa MAX_START_ATTEMPTS lần
 * - Lỗi khác hoặc hết lượt: ném lỗi ra ngoài
 *
 * @param start Hàm bật container, gọi lại được nhiều lần
 * @returns Promise trả về container đã bật
 * @throws Error Nếu bật lỗi vì lý do khác hoặc đã hết lượt thử
 */
export async function startContainerWithRetry<T>(
  start: () => Promise<T>,
): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await start();
    } catch (error) {
      const isPortBindingTimeout =
        error instanceof Error &&
        error.message.includes(PORT_BINDING_TIMEOUT_MESSAGE);
      if (!isPortBindingTimeout || attempt >= MAX_START_ATTEMPTS) throw error;
    }
  }
}

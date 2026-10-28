/** Thời gian tối đa (ms) cho thời gian mục tiêu và thời gian chạy của chạy thử: 1 giờ */
export const MAX_TRIAL_TIME_MS = 3_600_000;

/** Câu báo lỗi khi thời gian vượt MAX_TRIAL_TIME_MS */
export const MAX_TRIAL_TIME_MESSAGE = `Thời gian tối đa ${MAX_TRIAL_TIME_MS.toLocaleString('vi-VN')} ms (1 giờ)`;

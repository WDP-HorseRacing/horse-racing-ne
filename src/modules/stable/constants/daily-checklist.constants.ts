/**
 * Số phút chờ trước mỗi lần thử lại việc checklist hằng ngày bị lỗi, theo thứ tự lần lỗi; hết danh sách thì giữ số cuối
 */
export const CHECKLIST_RETRY_DELAYS_MINUTES = [5, 10, 20, 40, 60] as const;

/**
 * Lần chạy sinh checklist hôm nay thứ mấy (tính cả lần chạy chính) vẫn còn ngựa lỗi thì báo Club Manager
 */
export const CHECKLIST_FAILURE_NOTICE_ATTEMPT = 3;

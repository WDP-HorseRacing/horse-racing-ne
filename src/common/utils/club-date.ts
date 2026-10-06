import { CLUB_TIME_ZONE } from '../constants/club.constants';

/**
 * Đổi một thời điểm sang ngày theo lịch câu lạc bộ (CLUB_TIME_ZONE)
 *
 * @param date Thời điểm cần đổi, dạng Date hoặc chuỗi ISO
 * @returns Ngày dạng YYYY-MM-DD
 */
export function toClubDate(date: Date | string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: CLUB_TIME_ZONE }).format(
    new Date(date),
  );
}

/**
 * Lấy ngày hôm nay theo lịch câu lạc bộ
 *
 * @returns Ngày dạng YYYY-MM-DD
 */
export function clubToday(): string {
  return toClubDate(new Date());
}

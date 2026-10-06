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

/**
 * Đổi ngày YYYY-MM-DD sang dạng hiển thị dd/mm/yyyy
 *
 * @param date Ngày dạng YYYY-MM-DD
 * @returns Ngày dạng dd/mm/yyyy
 */
export function toDisplayDate(date: string): string {
  return date.split('-').reverse().join('/');
}

/**
 * Lùi một ngày đi số năm cho trước theo lịch
 *
 * - Ngày 29/02 lùi về năm không nhuận thì thành 28/02
 *
 * @param date Ngày dạng YYYY-MM-DD
 * @param years Số năm cần lùi
 * @returns Ngày dạng YYYY-MM-DD
 */
export function subtractYears(date: string, years: number): string {
  const [year, month, day] = date.split('-').map(Number);
  const target = year - years;
  const lastDay = new Date(Date.UTC(target, month, 0)).getUTCDate();
  const shifted = new Date(Date.UTC(target, month - 1, Math.min(day, lastDay)));
  return shifted.toISOString().slice(0, 10);
}

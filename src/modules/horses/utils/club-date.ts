import { CLUB_TIME_ZONE } from '../constants/horse.constants';

/**
 * Lấy ngày hôm nay theo múi giờ câu lạc bộ
 *
 * @returns Ngày dạng YYYY-MM-DD
 */
export function clubToday(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: CLUB_TIME_ZONE,
  }).format(new Date());
}

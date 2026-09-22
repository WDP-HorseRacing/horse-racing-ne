import { CLUB_TIME_ZONE } from '../enums/horse.constants';

/**
 * Get today's date in the club time zone
 * @returns The date as YYYY-MM-DD
 */
export function clubToday(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: CLUB_TIME_ZONE,
  }).format(new Date());
}

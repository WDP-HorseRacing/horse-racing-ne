import {
  clubDateTimeToInstant,
  clubToday,
  subtractYears,
  toClubDate,
  toDisplayDate,
} from './club-date';

describe('toClubDate', () => {
  it('converts an instant to the club calendar date', () => {
    expect(toClubDate(new Date('2026-09-26T18:30:00Z'))).toBe('2026-09-27');
    expect(toClubDate(new Date('2026-09-26T16:59:59Z'))).toBe('2026-09-26');
  });

  it('accepts an ISO string', () => {
    expect(toClubDate('2026-10-04T17:00:00.000Z')).toBe('2026-10-05');
  });
});

describe('toDisplayDate', () => {
  it('formats a date as dd/mm/yyyy', () => {
    expect(toDisplayDate('2026-06-01')).toBe('01/06/2026');
  });
});

describe('subtractYears', () => {
  it('moves the date back by whole years', () => {
    expect(subtractYears('2026-10-06', 1)).toBe('2025-10-06');
    expect(subtractYears('2026-10-06', 40)).toBe('1986-10-06');
  });

  it('turns 29 February into 28 February in a non-leap year', () => {
    expect(subtractYears('2028-02-29', 1)).toBe('2027-02-28');
    expect(subtractYears('2028-02-29', 4)).toBe('2024-02-29');
  });
});

describe('clubToday', () => {
  it('returns today in YYYY-MM-DD', () => {
    expect(clubToday()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('clubDateTimeToInstant', () => {
  it('converts a club local date and time to UTC', () => {
    expect(clubDateTimeToInstant('2026-10-05', '06:00').toISOString()).toBe(
      '2026-10-04T23:00:00.000Z',
    );
    expect(clubDateTimeToInstant('2026-10-05', '15:30').toISOString()).toBe(
      '2026-10-05T08:30:00.000Z',
    );
  });
});

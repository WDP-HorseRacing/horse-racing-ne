import { clubToday, toClubDate } from './club-date';

describe('toClubDate', () => {
  it('converts an instant to the club calendar date', () => {
    expect(toClubDate(new Date('2026-09-26T18:30:00Z'))).toBe('2026-09-27');
    expect(toClubDate(new Date('2026-09-26T16:59:59Z'))).toBe('2026-09-26');
  });

  it('accepts an ISO string', () => {
    expect(toClubDate('2026-10-04T17:00:00.000Z')).toBe('2026-10-05');
  });
});

describe('clubToday', () => {
  it('returns today in YYYY-MM-DD', () => {
    expect(clubToday()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

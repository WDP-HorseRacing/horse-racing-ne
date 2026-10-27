import { BadRequestException } from '@nestjs/common';
import { resolveReportPeriod } from './report-period';

describe('resolveReportPeriod', () => {
  it('defaults to the 30 days that end today', () => {
    expect(resolveReportPeriod({}, '2026-10-14')).toEqual({
      from: '2026-09-15',
      to: '2026-10-14',
      start: new Date('2026-09-14T17:00:00.000Z'),
      end: new Date('2026-10-14T17:00:00.000Z'),
    });
  });

  it('keeps the given days and counts 30 days back from a given end', () => {
    expect(
      resolveReportPeriod({ to: '2026-09-30' }, '2026-10-14'),
    ).toMatchObject({ from: '2026-09-01', to: '2026-09-30' });
    expect(
      resolveReportPeriod(
        { from: '2026-10-01', to: '2026-10-01' },
        '2026-10-14',
      ),
    ).toMatchObject({ from: '2026-10-01', to: '2026-10-01' });
  });

  it('rejects a start after the end', () => {
    expect(() =>
      resolveReportPeriod(
        { from: '2026-10-02', to: '2026-10-01' },
        '2026-10-14',
      ),
    ).toThrow(BadRequestException);
  });
});

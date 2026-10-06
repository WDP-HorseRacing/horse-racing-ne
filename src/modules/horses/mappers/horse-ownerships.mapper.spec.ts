import type { HorseOwnershipEntity } from '../entities/horse-ownership.entity';
import { toOwnershipHistory } from './horse-ownerships.mapper';

const period = (
  id: string,
  ownerId: string,
  effectiveDate: string,
  startedAt: string,
  endedAt: string | null,
): HorseOwnershipEntity =>
  ({
    id,
    ownerId,
    owner: { id: ownerId, fullName: `Chủ ${ownerId}` },
    effectiveDate,
    startedAt: new Date(startedAt),
    endedAt: endedAt ? new Date(endedAt) : null,
    reason: null,
    recorder: null,
  }) as unknown as HorseOwnershipEntity;

describe('toOwnershipHistory', () => {
  const periods = [
    period(
      'p1',
      'a',
      '2026-01-01',
      '2026-01-01T03:00:00Z',
      '2026-06-02T03:00:00Z',
    ),
    period(
      'p2',
      'b',
      '2026-06-01',
      '2026-06-02T03:00:00Z',
      '2026-08-01T18:00:00Z',
    ),
    period('p3', 'a', '2026-09-01', '2026-09-01T03:00:00Z', null),
  ];

  it('lists newest first with the next effective date as the end date', () => {
    const history = toOwnershipHistory(periods, null);
    expect(history.map((row) => [row.id, row.endDate])).toEqual([
      ['p3', null],
      ['p2', '2026-09-01'],
      ['p1', '2026-06-01'],
    ]);
    expect(history[0]).toMatchObject({
      owner: { id: 'a', fullName: 'Chủ a' },
      effectiveDate: '2026-09-01',
      recordedBy: null,
      recordedAt: new Date('2026-09-01T03:00:00Z'),
    });
  });

  it('uses the club date of the end when no period follows', () => {
    const history = toOwnershipHistory(periods.slice(0, 2), null);
    expect(history[0].endDate).toBe('2026-08-02');
  });

  it('keeps only the periods of the given owner, ends computed from the full history', () => {
    expect(
      toOwnershipHistory(periods, 'a').map((row) => [row.id, row.endDate]),
    ).toEqual([
      ['p3', null],
      ['p1', '2026-06-01'],
    ]);
  });
});

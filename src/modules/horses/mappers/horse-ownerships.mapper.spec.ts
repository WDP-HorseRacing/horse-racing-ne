import type { HorseOwnershipEntity } from '../entities/horse-ownership.entity';
import { toOwnershipHistory } from './horse-ownerships.mapper';

const period = (
  id: string,
  ownerId: string,
  startedAt: string,
  endedAt: string | null,
): HorseOwnershipEntity =>
  ({
    id,
    ownerId,
    owner: { id: ownerId, fullName: `Chủ ${ownerId}` },
    startedAt: new Date(startedAt),
    endedAt: endedAt ? new Date(endedAt) : null,
    reason: null,
    recorder: null,
  }) as unknown as HorseOwnershipEntity;

describe('toOwnershipHistory', () => {
  const periods = [
    period('p1', 'a', '2026-01-01T03:00:00Z', '2026-06-02T03:00:00Z'),
    period('p3', 'a', '2026-09-01T03:00:00Z', null),
    period('p2', 'b', '2026-06-02T03:00:00Z', '2026-09-01T03:00:00Z'),
  ];

  it('lists newest first with start and end instants', () => {
    const history = toOwnershipHistory(periods, null);
    expect(history.map((row) => row.id)).toEqual(['p3', 'p2', 'p1']);
    expect(history[1]).toEqual({
      id: 'p2',
      owner: { id: 'b', fullName: 'Chủ b' },
      startedAt: new Date('2026-06-02T03:00:00Z'),
      endedAt: new Date('2026-09-01T03:00:00Z'),
      reason: null,
      recordedBy: null,
    });
    expect(history[0].endedAt).toBeNull();
  });

  it('keeps only the periods of the given owner', () => {
    expect(toOwnershipHistory(periods, 'a').map((row) => row.id)).toEqual([
      'p3',
      'p1',
    ]);
  });
});

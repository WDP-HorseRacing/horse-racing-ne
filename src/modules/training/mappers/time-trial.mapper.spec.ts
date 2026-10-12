import { TimeTrialEntity } from '../entities/time-trial.entity';
import { TrialResultEntity } from '../entities/trial-result.entity';
import { toTimeTrialResponse } from './time-trial.mapper';
import { toTrialResultResponse } from './trial-result.mapper';

describe('time trial mappers', () => {
  it('returns distance and target time as numbers', () => {
    const row = {
      id: 't1',
      sessionId: 's1',
      distanceM: '1000.50',
      targetTimeMs: '62000',
      notes: null,
      createdAt: new Date('2026-10-01T00:00:00Z'),
    } as TimeTrialEntity;

    expect(toTimeTrialResponse(row)).toMatchObject({
      distanceM: 1000.5,
      targetTimeMs: 62000,
    });
  });

  it('keeps a missing target time as null', () => {
    const row = {
      distanceM: '1200.00',
      targetTimeMs: null,
    } as TimeTrialEntity;

    expect(toTimeTrialResponse(row).targetTimeMs).toBeNull();
  });

  it('returns elapsed time of a trial result as a number', () => {
    const row = { id: 'r1', elapsedMs: '61000' } as TrialResultEntity;

    expect(toTrialResultResponse(row, null).elapsedMs).toBe(61000);
  });
});

import { changedFieldsDiff } from './record-diff';

describe('changedFieldsDiff', () => {
  it('keeps only the fields whose value changes', () => {
    const current: {
      name: string;
      capacity: number;
      headTrainerId: string | null;
    } = { name: 'A', capacity: 3, headTrainerId: 'ht-1' };
    expect(
      changedFieldsDiff(current, {
        name: 'A',
        capacity: 5,
        headTrainerId: null,
      }),
    ).toEqual({
      before: { capacity: 3, headTrainerId: 'ht-1' },
      after: { capacity: 5, headTrainerId: null },
    });
  });

  it('returns null when nothing changes', () => {
    expect(
      changedFieldsDiff(
        { name: 'A', capacity: 3 },
        { name: 'A', capacity: undefined },
      ),
    ).toBeNull();
  });
});

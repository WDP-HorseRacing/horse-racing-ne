import { changedFields, pickFields } from './record-diff';

describe('changedFields', () => {
  it('keeps only the fields sent with a different value', () => {
    expect(
      changedFields(
        { name: 'Gió Bắc', breed: 'Thoroughbred', color: null },
        { name: 'Gió Nam', breed: 'Thoroughbred', color: undefined },
      ),
    ).toEqual({ name: 'Gió Nam' });
  });

  it('treats null as a value that clears the field', () => {
    expect(
      changedFields<{ color: string | null }>(
        { color: 'Bay' },
        { color: null },
      ),
    ).toEqual({
      color: null,
    });
  });
});

describe('pickFields', () => {
  it('reads the listed fields only', () => {
    expect(
      pickFields({ name: 'Gió Bắc', color: null, breed: 'Arab' }, [
        'name',
        'color',
      ]),
    ).toEqual({ name: 'Gió Bắc', color: null });
  });
});

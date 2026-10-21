import { toQueryBoolean } from './query-boolean';

describe('toQueryBoolean', () => {
  it.each([
    ['true', true],
    [true, true],
    ['false', false],
    [false, false],
    ['yes', 'yes'],
    [undefined, undefined],
  ])('maps %p to %p', (value, expected) => {
    expect(toQueryBoolean({ value })).toBe(expected);
  });
});

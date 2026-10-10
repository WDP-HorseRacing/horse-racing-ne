import {
  addDecimal,
  compareDecimal,
  averageDecimal,
  roundDecimal,
  subtractDecimal,
} from './decimal';

describe('averageDecimal', () => {
  it.each([
    ['201', 2, 0, '101'],
    ['200', 2, 0, '100'],
    ['301', 3, 0, '100'],
    ['30.002', 3, 3, '10.001'],
    ['25', 2, 3, '12.500'],
    ['0.001', 2, 3, '0.001'],
    ['0.003', 2, 3, '0.002'],
    ['-0.003', 2, 3, '-0.002'],
    ['1.5E+2', 1, 3, '150.000'],
  ])(
    'averages %s over %d to %d decimals as %s',
    (sum, count, scale, expected) => {
      expect(averageDecimal(sum, count, scale)).toBe(expected);
    },
  );

  it('rejects a value that is not a number', () => {
    expect(() => averageDecimal('abc', 1, 3)).toThrow();
  });
});

describe('roundDecimal', () => {
  it.each([
    ['12.25', '12.250'],
    ['20', '20.000'],
    ['0.0004', '0.000'],
    ['0.0005', '0.001'],
  ])('formats %s as %s', (value, expected) => {
    expect(roundDecimal(value, 3)).toBe(expected);
  });
});

describe('subtractDecimal and addDecimal', () => {
  it('keeps exact cents where floats drift', () => {
    expect(subtractDecimal('0.3', '0.1', 2)).toBe('0.20');
    expect(addDecimal('0.1', '0.2', 2)).toBe('0.30');
  });

  it('returns a negative difference', () => {
    expect(subtractDecimal('40', '52.5', 2)).toBe('-12.50');
  });
});

describe('compareDecimal', () => {
  it.each([
    ['40.00', '50', -1],
    ['50.00', '50', 0],
    ['50.01', '50', 1],
  ])('compares %s with %s as %d', (left, right, expected) => {
    expect(compareDecimal(left, right)).toBe(expected);
  });
});

import { BadRequestException, ConflictException } from '@nestjs/common';
import {
  assertDailyFeeDeletable,
  assertEffectiveFromNotPast,
} from './daily-fee.policy';

describe('daily fee policy', () => {
  it('accepts today or a later day as the effective date, not a past day', () => {
    expect(() =>
      assertEffectiveFromNotPast('2026-10-14', '2026-10-14'),
    ).not.toThrow();
    expect(() =>
      assertEffectiveFromNotPast('2026-11-01', '2026-10-14'),
    ).not.toThrow();
    expect(() =>
      assertEffectiveFromNotPast('2026-10-13', '2026-10-14'),
    ).toThrow(BadRequestException);
  });

  it('deletes only a fee that is not in effect yet', () => {
    expect(() =>
      assertDailyFeeDeletable('2026-10-15', '2026-10-14'),
    ).not.toThrow();
    expect(() => assertDailyFeeDeletable('2026-10-14', '2026-10-14')).toThrow(
      ConflictException,
    );
  });
});

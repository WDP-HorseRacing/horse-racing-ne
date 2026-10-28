import { BadRequestException, ConflictException } from '@nestjs/common';
import {
  assertDailyFeeDeletable,
  assertDailyFeeEditable,
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

  it('edits a future fee and the fee in effect today, not a superseded one', () => {
    const today = '2026-10-14';
    expect(() =>
      assertDailyFeeEditable('2026-10-20', today, '2026-10-01'),
    ).not.toThrow();
    expect(() =>
      assertDailyFeeEditable('2026-10-01', today, '2026-10-01'),
    ).not.toThrow();
    expect(() => assertDailyFeeEditable(today, today, today)).not.toThrow();
    expect(() =>
      assertDailyFeeEditable('2026-09-01', today, '2026-10-01'),
    ).toThrow(ConflictException);
    expect(() => assertDailyFeeEditable('2026-10-01', today, today)).toThrow(
      ConflictException,
    );
  });
});

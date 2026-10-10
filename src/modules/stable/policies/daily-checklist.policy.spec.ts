import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { DailyChecklistStatus } from '../constants/daily-checklist-status.enum';
import {
  assertAssignableCareTaskType,
  assertCareTaskRange,
  assertChecklistRange,
  assertChecklistGroom,
  assertChecklistToday,
  assertNoOverlappingCareTask,
  careTaskRemovalOf,
  checklistStatusOf,
} from './daily-checklist.policy';

describe('daily checklist policy', () => {
  it.each([
    [0, 4, DailyChecklistStatus.PENDING],
    [1, 4, DailyChecklistStatus.IN_PROGRESS],
    [3, 4, DailyChecklistStatus.IN_PROGRESS],
    [4, 4, DailyChecklistStatus.COMPLETED],
  ])('derives %d of %d done as %s', (done, total, expected) => {
    expect(checklistStatusOf(done, total)).toBe(expected);
  });

  it('lets only the checklist groom tick', () => {
    expect(() => assertChecklistGroom('g', 'g')).not.toThrow();
    expect(() => assertChecklistGroom('g', 'x')).toThrow(ForbiddenException);
  });

  it('only writes today', () => {
    expect(() =>
      assertChecklistToday('2026-10-10', '2026-10-10'),
    ).not.toThrow();
    expect(() => assertChecklistToday('2026-10-09', '2026-10-10')).toThrow(
      ConflictException,
    );
  });

  describe('assertCareTaskRange', () => {
    const today = '2026-10-10';

    it('accepts a one-day task today', () => {
      expect(() => assertCareTaskRange(today, today, today)).not.toThrow();
    });

    it('accepts exactly 366 days', () => {
      expect(() =>
        assertCareTaskRange(today, '2027-10-10', today),
      ).not.toThrow();
    });

    it.each([
      ['2026-10-09', '2026-10-12'],
      ['2026-10-12', '2026-10-11'],
      ['2026-10-10', '2027-10-11'],
    ])('rejects %s to %s', (from, to) => {
      expect(() => assertCareTaskRange(from, to, today)).toThrow(
        BadRequestException,
      );
    });
  });

  it('only assigns an active type that is not already for every horse', () => {
    expect(() =>
      assertAssignableCareTaskType({
        name: 'Ngâm đá',
        active: true,
        appliesToAll: false,
      }),
    ).not.toThrow();
    expect(() =>
      assertAssignableCareTaskType({
        name: 'Ngâm đá',
        active: false,
        appliesToAll: false,
      }),
    ).toThrow(ConflictException);
    expect(() =>
      assertAssignableCareTaskType({
        name: 'Cho ăn',
        active: true,
        appliesToAll: true,
      }),
    ).toThrow(ConflictException);
  });

  it('rejects an overlapping assignment', () => {
    expect(() => assertNoOverlappingCareTask(false)).not.toThrow();
    expect(() => assertNoOverlappingCareTask(true)).toThrow(ConflictException);
  });

  describe('careTaskRemovalOf', () => {
    const today = '2026-10-10';

    it('deletes a task that has not started', () => {
      expect(careTaskRemovalOf('2026-10-11', '2026-10-20', today)).toBe(
        'DELETE',
      );
    });

    it('ends a running task today', () => {
      expect(careTaskRemovalOf('2026-10-01', '2026-10-10', today)).toBe(
        'END_TODAY',
      );
      expect(careTaskRemovalOf(today, '2026-10-20', today)).toBe('END_TODAY');
    });

    it('refuses a task that already ended', () => {
      expect(() =>
        careTaskRemovalOf('2026-10-01', '2026-10-09', today),
      ).toThrow(ConflictException);
    });
  });

  it('limits the checklist view to 31 days in order', () => {
    expect(() =>
      assertChecklistRange('2026-10-01', '2026-10-31'),
    ).not.toThrow();
    expect(() => assertChecklistRange('2026-10-01', '2026-11-01')).toThrow(
      BadRequestException,
    );
    expect(() => assertChecklistRange('2026-10-02', '2026-10-01')).toThrow(
      BadRequestException,
    );
  });
});

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { UserRole } from '../../../common/enums/role.enum';
import { DailyChecklistStatus } from '../constants/daily-checklist-status.enum';
import { HorseCareTaskMode } from '../constants/horse-care-task-mode.enum';
import {
  assertAppliesToAllChangeable,
  assertAssignableCareTaskType,
  assertCareTaskWriter,
  assertExemptionReason,
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

  describe('assertAssignableCareTaskType', () => {
    const extra = { name: 'Ngâm đá', active: true, appliesToAll: false };
    const shared = { name: 'Cho ăn sáng', active: true, appliesToAll: true };
    const { EXTRA, EXEMPT } = HorseCareTaskMode;

    it('adds only an active type that is not for every horse', () => {
      expect(() => assertAssignableCareTaskType(extra, EXTRA)).not.toThrow();
      expect(() =>
        assertAssignableCareTaskType({ ...extra, active: false }, EXTRA),
      ).toThrow(ConflictException);
      expect(() => assertAssignableCareTaskType(shared, EXTRA)).toThrow(
        ConflictException,
      );
    });

    it('exempts only an active type that is for every horse', () => {
      expect(() => assertAssignableCareTaskType(shared, EXEMPT)).not.toThrow();
      expect(() => assertAssignableCareTaskType(extra, EXEMPT)).toThrow(
        new ConflictException(
          'Loại việc Ngâm đá không áp cho mọi ngựa, không cần miễn',
        ),
      );
      expect(() =>
        assertAssignableCareTaskType({ ...shared, active: false }, EXEMPT),
      ).toThrow(ConflictException);
    });
  });

  it('requires a reason to exempt a horse, not to add a task', () => {
    expect(() =>
      assertExemptionReason(HorseCareTaskMode.EXEMPT, 'Ngựa đang sốt'),
    ).not.toThrow();
    expect(() => assertExemptionReason(HorseCareTaskMode.EXEMPT, null)).toThrow(
      BadRequestException,
    );
    expect(() =>
      assertExemptionReason(HorseCareTaskMode.EXTRA, null),
    ).not.toThrow();
  });

  it('blocks switching "for every horse" only while horse rows are still open', () => {
    expect(() => assertAppliesToAllChangeable(true, true)).toThrow(
      ConflictException,
    );
    expect(() => assertAppliesToAllChangeable(true, false)).not.toThrow();
    expect(() => assertAppliesToAllChangeable(false, true)).not.toThrow();
  });

  it('rejects an overlapping assignment', () => {
    expect(() => assertNoOverlappingCareTask(false)).not.toThrow();
    expect(() => assertNoOverlappingCareTask(true)).toThrow(ConflictException);
  });

  describe('careTaskRemovalOf', () => {
    const today = '2026-10-10';
    const { EXTRA, EXEMPT } = HorseCareTaskMode;

    it('deletes an added task that has not started', () => {
      expect(careTaskRemovalOf(EXTRA, '2026-10-11', '2026-10-20', today)).toBe(
        'DELETE',
      );
    });

    it('ends a running added task today', () => {
      expect(careTaskRemovalOf(EXTRA, '2026-10-01', '2026-10-10', today)).toBe(
        'END_TODAY',
      );
      expect(careTaskRemovalOf(EXTRA, today, '2026-10-20', today)).toBe(
        'END_TODAY',
      );
    });

    it('deletes an exemption starting today and ends an older one yesterday', () => {
      expect(careTaskRemovalOf(EXEMPT, today, '2026-10-20', today)).toBe(
        'DELETE',
      );
      expect(careTaskRemovalOf(EXEMPT, '2026-10-01', '2026-10-20', today)).toBe(
        'END_YESTERDAY',
      );
    });

    it('refuses a row that already ended', () => {
      for (const mode of [EXTRA, EXEMPT]) {
        expect(() =>
          careTaskRemovalOf(mode, '2026-10-01', '2026-10-09', today),
        ).toThrow(ConflictException);
      }
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

  describe('assertCareTaskWriter', () => {
    const inBarn = { barnId: 'barn-1' };
    const noBarn = { barnId: null };

    it.each([
      [inBarn, true],
      [inBarn, false],
      [noBarn, false],
    ])(
      'lets a veterinarian change any horse (%o, in barn %s)',
      (horse, own) => {
        expect(() =>
          assertCareTaskWriter([UserRole.VETERINARIAN], horse, own),
        ).not.toThrow();
      },
    );

    it('lets a head trainer change a horse of their own barn only', () => {
      expect(() =>
        assertCareTaskWriter([UserRole.HEAD_TRAINER], inBarn, true),
      ).not.toThrow();
      expect(() =>
        assertCareTaskWriter([UserRole.HEAD_TRAINER], inBarn, false),
      ).toThrow(new ForbiddenException('Ngựa không thuộc khu bạn phụ trách'));
      expect(() =>
        assertCareTaskWriter([UserRole.HEAD_TRAINER], noBarn, false),
      ).toThrow(ConflictException);
    });

    it('lets a head trainer who is also a veterinarian change a horse of another barn', () => {
      expect(() =>
        assertCareTaskWriter(
          [UserRole.HEAD_TRAINER, UserRole.VETERINARIAN],
          inBarn,
          false,
        ),
      ).not.toThrow();
    });

    it.each([[UserRole.CLUB_MANAGER], [UserRole.GROOM]])(
      'refuses %s',
      (role) => {
        expect(() => assertCareTaskWriter([role], inBarn, false)).toThrow(
          ForbiddenException,
        );
      },
    );
  });
});

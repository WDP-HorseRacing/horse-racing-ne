import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { UserRole } from '../../../common/enums/role.enum';
import { UserStatus } from '../../../common/enums/user-status.enum';
import { HorseLifecycleStatus } from '../../horses/enums/horse-status.enum';
import { BarnStatus } from '../constants/barn-status.enum';
import { StallStatus } from '../constants/stall-status.enum';
import type { BarnChange } from '../types/stable.types';
import {
  assertAssignableGroom,
  assertBarnActive,
  assertBarnChangeKeepsHorses,
  assertBarnHasStallRoom,
  assertBarnRemovable,
  assertCapacityFitsStalls,
  assertFreeStallRemovable,
  assertHorseHasBarn,
  assertHorseInTrainerBarn,
  assertHorseNotTransferred,
  assertManualStallStatusChange,
  assertStallBarnChangeable,
  changedFieldsDiff,
  fullBarnMessage,
  isActiveHeadTrainer,
  isStallFree,
  remainingStallCount,
} from './stable.policy';

describe('stable.policy', () => {
  describe('remainingStallCount', () => {
    it.each([
      [3, 1, 2],
      [1, 1, 0],
      [1, 4, 0],
      [0, 0, 0],
    ])(
      '%i free stalls and %i waiting horses leave %i places',
      (freeStallCount, pendingStallHorseCount, expected) => {
        expect(
          remainingStallCount({ freeStallCount, pendingStallHorseCount }),
        ).toBe(expected);
      },
    );
  });

  describe('fullBarnMessage', () => {
    it('says the barn has no free stall when no horse is waiting', () => {
      expect(
        fullBarnMessage({ freeStallCount: 0, pendingStallHorseCount: 0 }),
      ).toBe('Khu chuồng đã hết ô trống, vui lòng chọn khu khác');
    });

    it('names the free stalls and the waiting horses', () => {
      expect(
        fullBarnMessage({ freeStallCount: 2, pendingStallHorseCount: 3 }),
      ).toBe(
        'Khu chuồng đã hết chỗ: 2 ô trống nhưng đã có 3 ngựa chờ xếp ô, vui lòng chọn khu khác',
      );
    });
  });

  describe('isActiveHeadTrainer', () => {
    it('accepts an active HEAD_TRAINER', () => {
      expect(
        isActiveHeadTrainer({
          role: UserRole.HEAD_TRAINER,
          status: UserStatus.ACTIVE,
        }),
      ).toBe(true);
    });

    it.each([
      ['no user', null],
      [
        'a locked head trainer',
        { role: UserRole.HEAD_TRAINER, status: UserStatus.LOCKED },
      ],
      ['another role', { role: UserRole.GROOM, status: UserStatus.ACTIVE }],
    ])('rejects %s', (_label, user) => {
      expect(isActiveHeadTrainer(user)).toBe(false);
    });
  });

  describe('isStallFree', () => {
    it('accepts an AVAILABLE stall without an open assignment', () => {
      expect(isStallFree(StallStatus.AVAILABLE, false)).toBe(true);
    });

    it('rejects an AVAILABLE stall that still has an open assignment', () => {
      expect(isStallFree(StallStatus.AVAILABLE, true)).toBe(false);
    });

    it.each([StallStatus.OCCUPIED, StallStatus.MAINTENANCE])(
      'rejects a %s stall',
      (status) => {
        expect(isStallFree(status, false)).toBe(false);
      },
    );
  });

  describe('horse rules', () => {
    it('returns the barn of a placed horse', () => {
      expect(assertHorseHasBarn({ barnId: 'b1' })).toBe('b1');
    });

    it('rejects a horse without a barn', () => {
      expect(() => assertHorseHasBarn({ barnId: null })).toThrow(
        ConflictException,
      );
    });

    it('rejects a horse outside the trainer barn with 403', () => {
      expect(() => assertHorseInTrainerBarn(false)).toThrow(ForbiddenException);
      expect(() => assertHorseInTrainerBarn(true)).not.toThrow();
    });

    it.each([
      ['STALL', 'Ngựa đã chuyển nhượng, không xếp ô chuồng được'],
      ['GROOM', 'Ngựa đã chuyển nhượng, không giao groom được'],
    ] as const)('rejects a transferred horse for %s', (operation, message) => {
      expect(() =>
        assertHorseNotTransferred(
          { lifecycleStatus: HorseLifecycleStatus.TRANSFERRED },
          operation,
        ),
      ).toThrow(new ConflictException(message));
    });

    it('lets a retired horse through', () => {
      expect(() =>
        assertHorseNotTransferred(
          { lifecycleStatus: HorseLifecycleStatus.RETIRED },
          'STALL',
        ),
      ).not.toThrow();
    });
  });

  describe('barn rules', () => {
    it.each([BarnStatus.MAINTENANCE, BarnStatus.CLOSED])(
      'rejects a %s barn with the given label',
      (status) => {
        expect(() => assertBarnActive({ status }, 'Khu chuồng đích')).toThrow(
          new BadRequestException(
            'Khu chuồng đích không ở trạng thái hoạt động',
          ),
        );
      },
    );

    it('rejects a full barn and accepts one with room or without capacity', () => {
      expect(() => assertBarnHasStallRoom({ capacity: 2 }, 2)).toThrow(
        new ConflictException('Khu chuồng đã đạt sức chứa tối đa (2 ô chuồng)'),
      );
      expect(() => assertBarnHasStallRoom({ capacity: 2 }, 1)).not.toThrow();
      expect(() =>
        assertBarnHasStallRoom({ capacity: null }, 99),
      ).not.toThrow();
    });

    it('rejects removing a barn with horses before one with stalls', () => {
      expect(() => assertBarnRemovable(true, true)).toThrow(
        new ConflictException('Không thể xóa khu chuồng khi vẫn còn ngựa'),
      );
      expect(() => assertBarnRemovable(false, true)).toThrow(
        new ConflictException(
          'Không thể xóa khu chuồng khi vẫn còn ô chuồng bên trong',
        ),
      );
      expect(() => assertBarnRemovable(false, false)).not.toThrow();
    });
  });

  describe('assertBarnChangeKeepsHorses', () => {
    const change = (patch: Partial<BarnChange>): BarnChange => ({
      hasHorses: true,
      currentStatus: BarnStatus.ACTIVE,
      currentHeadTrainerId: 'ht-1',
      ...patch,
    });

    it.each([BarnStatus.CLOSED, BarnStatus.MAINTENANCE])(
      'rejects moving a barn with horses to %s',
      (nextStatus) => {
        expect(() =>
          assertBarnChangeKeepsHorses(change({ nextStatus })),
        ).toThrow(ConflictException);
      },
    );

    it('accepts sending the status the barn already has', () => {
      expect(() =>
        assertBarnChangeKeepsHorses(
          change({
            currentStatus: BarnStatus.MAINTENANCE,
            nextStatus: BarnStatus.MAINTENANCE,
          }),
        ),
      ).not.toThrow();
    });

    it('rejects removing the head trainer of a barn with horses', () => {
      expect(() =>
        assertBarnChangeKeepsHorses(change({ nextHeadTrainerId: null })),
      ).toThrow(ConflictException);
    });

    it('accepts replacing the head trainer of a barn with horses', () => {
      expect(() =>
        assertBarnChangeKeepsHorses(change({ nextHeadTrainerId: 'ht-2' })),
      ).not.toThrow();
    });

    it('lets every change through when the barn has no horse', () => {
      expect(() =>
        assertBarnChangeKeepsHorses(
          change({
            hasHorses: false,
            nextStatus: BarnStatus.CLOSED,
            nextHeadTrainerId: null,
          }),
        ),
      ).not.toThrow();
    });
  });

  describe('assertCapacityFitsStalls', () => {
    it('rejects a capacity below the stall count with 409', () => {
      expect(() => assertCapacityFitsStalls(4, 3)).toThrow(ConflictException);
    });

    it('accepts an equal, larger, unlimited or unchanged capacity', () => {
      expect(() => assertCapacityFitsStalls(4, 4)).not.toThrow();
      expect(() => assertCapacityFitsStalls(4, 10)).not.toThrow();
      expect(() => assertCapacityFitsStalls(4, null)).not.toThrow();
      expect(() => assertCapacityFitsStalls(4, undefined)).not.toThrow();
    });
  });

  describe('stall rules', () => {
    it('rejects moving a stall that has a horse to another barn', () => {
      expect(() => assertStallBarnChangeable(true)).toThrow(ConflictException);
      expect(() => assertStallBarnChangeable(false)).not.toThrow();
    });

    it('rejects a manual status change on a stall that has a horse', () => {
      expect(() =>
        assertManualStallStatusChange(StallStatus.AVAILABLE, true),
      ).toThrow(
        new ConflictException(
          'Ô chuồng đang có ngựa, không đổi trạng thái được',
        ),
      );
    });

    it('rejects a manual status change from OCCUPIED', () => {
      expect(() =>
        assertManualStallStatusChange(StallStatus.OCCUPIED, false),
      ).toThrow(ConflictException);
    });

    it.each([StallStatus.AVAILABLE, StallStatus.MAINTENANCE])(
      'accepts a manual status change from an empty %s stall',
      (status) => {
        expect(() =>
          assertManualStallStatusChange(status, false),
        ).not.toThrow();
      },
    );
  });

  describe('assertFreeStallRemovable', () => {
    it('rejects when the remaining free stalls cannot hold the pending horses', () => {
      expect(() =>
        assertFreeStallRemovable({
          freeStallCount: 2,
          pendingStallHorseCount: 2,
        }),
      ).toThrow(
        new ConflictException(
          'Khu còn 2 ngựa chờ xếp ô, không đưa ô này ra khỏi danh sách ô trống được. Vui lòng xếp ô cho ngựa hoặc chuyển ngựa sang khu khác trước',
        ),
      );
    });

    it('accepts when the remaining free stalls still hold every pending horse', () => {
      expect(() =>
        assertFreeStallRemovable({
          freeStallCount: 3,
          pendingStallHorseCount: 2,
        }),
      ).not.toThrow();
      expect(() =>
        assertFreeStallRemovable({
          freeStallCount: 1,
          pendingStallHorseCount: 0,
        }),
      ).not.toThrow();
    });
  });

  describe('assertAssignableGroom', () => {
    it('accepts an active GROOM', () => {
      expect(() =>
        assertAssignableGroom({
          role: UserRole.GROOM,
          status: UserStatus.ACTIVE,
        }),
      ).not.toThrow();
    });

    it.each([
      ['no user', null],
      [
        'an inactive groom',
        { role: UserRole.GROOM, status: UserStatus.INACTIVE },
      ],
      [
        'another role',
        { role: UserRole.VETERINARIAN, status: UserStatus.ACTIVE },
      ],
    ])('rejects %s', (_label, user) => {
      expect(() => assertAssignableGroom(user)).toThrow(BadRequestException);
    });
  });

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
});

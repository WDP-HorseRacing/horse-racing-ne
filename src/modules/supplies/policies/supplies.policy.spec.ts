import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { UserRole } from '../../../common/enums/role.enum';
import { SupplyRequestStatus } from '../enums/supply-request-status.enum';
import { SupplyCategory } from '../enums/supply-category.enum';
import {
  assertCanTakeSupply,
  assertCanViewSupplyRequest,
  assertUsageCancellable,
  assertUsageNote,
  assertUsageNotCancelled,
  assertRejectionReason,
  assertSupplyRequestEditable,
  assertSupplyRequestTransition,
} from './supplies.policy';

describe('supplies policy', () => {
  describe('assertCanViewSupplyRequest', () => {
    it('lets a Club Manager view any request', () => {
      expect(() =>
        assertCanViewSupplyRequest('cm', UserRole.CLUB_MANAGER, 'groom'),
      ).not.toThrow();
    });

    it('lets the requester view their own request', () => {
      expect(() =>
        assertCanViewSupplyRequest('groom', UserRole.GROOM, 'groom'),
      ).not.toThrow();
    });

    it('rejects another staff member', () => {
      expect(() =>
        assertCanViewSupplyRequest('ht', UserRole.HEAD_TRAINER, 'groom'),
      ).toThrow(ForbiddenException);
    });
  });

  describe('assertSupplyRequestEditable', () => {
    it('lets the requester edit a pending request', () => {
      expect(() =>
        assertSupplyRequestEditable('g', 'g', SupplyRequestStatus.PENDING),
      ).not.toThrow();
    });

    it('rejects someone else, even before checking the status', () => {
      expect(() =>
        assertSupplyRequestEditable('x', 'g', SupplyRequestStatus.APPROVED),
      ).toThrow(ForbiddenException);
    });

    it('rejects a request that is no longer pending', () => {
      expect(() =>
        assertSupplyRequestEditable('g', 'g', SupplyRequestStatus.APPROVED),
      ).toThrow(ConflictException);
    });
  });

  describe('assertSupplyRequestTransition', () => {
    it.each([
      [SupplyRequestStatus.PENDING, SupplyRequestStatus.APPROVED],
      [SupplyRequestStatus.PENDING, SupplyRequestStatus.REJECTED],
      [SupplyRequestStatus.APPROVED, SupplyRequestStatus.FULFILLED],
    ])('allows %s to %s', (current, next) => {
      expect(() => assertSupplyRequestTransition(current, next)).not.toThrow();
    });

    it.each([
      [SupplyRequestStatus.PENDING, SupplyRequestStatus.FULFILLED],
      [SupplyRequestStatus.APPROVED, SupplyRequestStatus.REJECTED],
      [SupplyRequestStatus.REJECTED, SupplyRequestStatus.APPROVED],
      [SupplyRequestStatus.FULFILLED, SupplyRequestStatus.FULFILLED],
    ])('rejects %s to %s', (current, next) => {
      expect(() => assertSupplyRequestTransition(current, next)).toThrow(
        ConflictException,
      );
    });
  });

  describe('assertRejectionReason', () => {
    it('requires a reason to reject', () => {
      expect(() =>
        assertRejectionReason(SupplyRequestStatus.REJECTED, null),
      ).toThrow(BadRequestException);
    });

    it('accepts a rejection with a reason', () => {
      expect(() =>
        assertRejectionReason(SupplyRequestStatus.REJECTED, 'Còn đủ'),
      ).not.toThrow();
    });

    it('does not need a reason to approve', () => {
      expect(() =>
        assertRejectionReason(SupplyRequestStatus.APPROVED, null),
      ).not.toThrow();
    });
  });

  describe('assertUsageCancellable', () => {
    const usedAt = new Date('2026-10-17T00:00:00Z');
    const usage = { usedBy: 'groom-1', usedAt };
    const hoursLater = (hours: number) =>
      new Date(usedAt.getTime() + hours * 3_600_000);

    it('lets the one who used it cancel within 24 hours', () => {
      expect(() =>
        assertUsageCancellable(
          'groom-1',
          UserRole.GROOM,
          usage,
          hoursLater(24),
        ),
      ).not.toThrow();
      expect(() =>
        assertUsageCancellable(
          'groom-1',
          UserRole.GROOM,
          usage,
          hoursLater(24.01),
        ),
      ).toThrow(ForbiddenException);
    });

    it('refuses anyone else but the club manager, who can cancel any time', () => {
      expect(() =>
        assertUsageCancellable('groom-2', UserRole.GROOM, usage, hoursLater(1)),
      ).toThrow(ForbiddenException);
      expect(() =>
        assertUsageCancellable(
          'cm-1',
          UserRole.CLUB_MANAGER,
          usage,
          hoursLater(24 * 30),
        ),
      ).not.toThrow();
    });
  });

  it('refuses to cancel a usage twice', () => {
    expect(() => assertUsageNotCancelled(false)).not.toThrow();
    expect(() => assertUsageNotCancelled(true)).toThrow(ConflictException);
  });

  describe('assertCanTakeSupply', () => {
    it.each([UserRole.VETERINARIAN, UserRole.CLUB_MANAGER])(
      'lets %s take medicine',
      (role) => {
        expect(() =>
          assertCanTakeSupply(role, SupplyCategory.MEDICINE),
        ).not.toThrow();
      },
    );

    it.each([UserRole.HEAD_TRAINER, UserRole.GROOM])(
      'rejects %s taking medicine',
      (role) => {
        expect(() =>
          assertCanTakeSupply(role, SupplyCategory.MEDICINE),
        ).toThrow(ForbiddenException);
      },
    );

    it.each([
      SupplyCategory.FEED,
      SupplyCategory.SUPPLEMENT,
      SupplyCategory.EQUIPMENT,
    ])('lets a groom take %s', (category) => {
      expect(() => assertCanTakeSupply(UserRole.GROOM, category)).not.toThrow();
    });
  });

  describe('assertUsageNote', () => {
    it('rejects a missing note', () => {
      expect(() => assertUsageNote(null)).toThrow(BadRequestException);
    });

    it('accepts a note', () => {
      expect(() => assertUsageNote('Bữa sáng')).not.toThrow();
    });
  });
});

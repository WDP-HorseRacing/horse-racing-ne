import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { UserRole } from '../../../common/enums/role.enum';
import { SupplyRequestStatus } from '../enums/supply-request-status.enum';
import {
  assertCanViewSupplyRequest,
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
});

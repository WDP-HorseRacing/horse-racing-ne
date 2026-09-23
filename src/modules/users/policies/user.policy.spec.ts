import { BadRequestException } from '@nestjs/common';
import { UserRole } from '../../../common/enums/role.enum';
import { UserStatus } from '../../../common/enums/user-status.enum';
import {
  assertNotSelfChange,
  isRemovingActiveManager,
  ManagedUser,
} from './user.policy';

describe('user.policy', () => {
  const manager: ManagedUser = {
    id: 'user-1',
    role: UserRole.CLUB_MANAGER,
    status: UserStatus.ACTIVE,
  };

  describe('assertNotSelfChange', () => {
    it('allows changing another user', () => {
      expect(() =>
        assertNotSelfChange('other', manager, {
          role: UserRole.GROOM,
          status: UserStatus.LOCKED,
        }),
      ).not.toThrow();
    });

    it('rejects changing own role with 400', () => {
      expect(() =>
        assertNotSelfChange(manager.id, manager, { role: UserRole.GROOM }),
      ).toThrow(
        new BadRequestException('Không thể tự đổi vai trò của chính mình'),
      );
    });

    it('rejects changing own status with 400', () => {
      expect(() =>
        assertNotSelfChange(manager.id, manager, {
          status: UserStatus.LOCKED,
        }),
      ).toThrow(
        new BadRequestException(
          'Không thể tự đổi trạng thái tài khoản của chính mình',
        ),
      );
    });

    it('allows resubmitting own current role and status', () => {
      expect(() =>
        assertNotSelfChange(manager.id, manager, {
          role: UserRole.CLUB_MANAGER,
          status: UserStatus.ACTIVE,
        }),
      ).not.toThrow();
    });
  });

  describe('isRemovingActiveManager', () => {
    it('is true when an active manager loses the role', () => {
      expect(isRemovingActiveManager(manager, { role: UserRole.GROOM })).toBe(
        true,
      );
    });

    it('is true when an active manager is deactivated', () => {
      expect(
        isRemovingActiveManager(manager, { status: UserStatus.INACTIVE }),
      ).toBe(true);
    });

    it('is false when the manager keeps role and status', () => {
      expect(
        isRemovingActiveManager(manager, {
          role: UserRole.CLUB_MANAGER,
          status: UserStatus.ACTIVE,
        }),
      ).toBe(false);
    });

    it('is false for a manager who is not active', () => {
      expect(
        isRemovingActiveManager(
          { ...manager, status: UserStatus.LOCKED },
          { role: UserRole.GROOM },
        ),
      ).toBe(false);
    });

    it('is false for a user who is not a manager', () => {
      expect(
        isRemovingActiveManager(
          { ...manager, role: UserRole.GROOM },
          { status: UserStatus.LOCKED },
        ),
      ).toBe(false);
    });
  });
});

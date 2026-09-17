import { UserRole, UserStatus } from '../user.enums';
import { getSelfChangeError, isRemovingActiveManager } from './user.rules';

describe('user rules', () => {
  const manager = {
    id: 'm1',
    role: UserRole.CLUB_MANAGER,
    status: UserStatus.ACTIVE,
  };

  describe('getSelfChangeError', () => {
    it('blocks changing own role', () => {
      expect(
        getSelfChangeError('m1', manager, { role: UserRole.GROOM }),
      ).not.toBeNull();
    });

    it('blocks locking own account', () => {
      expect(
        getSelfChangeError('m1', manager, { status: UserStatus.LOCKED }),
      ).not.toBeNull();
    });

    it('allows no-op or changes on other users', () => {
      expect(
        getSelfChangeError('m1', manager, { role: UserRole.CLUB_MANAGER }),
      ).toBeNull();
      expect(
        getSelfChangeError('m2', manager, { status: UserStatus.LOCKED }),
      ).toBeNull();
    });
  });

  describe('isRemovingActiveManager', () => {
    it('detects demoting an active manager', () => {
      expect(
        isRemovingActiveManager(manager, { role: UserRole.HEAD_TRAINER }),
      ).toBe(true);
    });

    it('detects locking an active manager', () => {
      expect(
        isRemovingActiveManager(manager, { status: UserStatus.INACTIVE }),
      ).toBe(true);
    });

    it('ignores non-manager users', () => {
      expect(
        isRemovingActiveManager(
          { id: 'g', role: UserRole.GROOM, status: UserStatus.ACTIVE },
          { status: UserStatus.LOCKED },
        ),
      ).toBe(false);
    });
  });
});

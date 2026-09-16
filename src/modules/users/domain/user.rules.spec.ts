import { UserRole, UserStatus } from '../user.enums';
import { removesActiveManager, selfChangeError } from './user.rules';

describe('user rules', () => {
  const manager = {
    id: 'm1',
    role: UserRole.CLUB_MANAGER,
    status: UserStatus.ACTIVE,
  };

  describe('selfChangeError', () => {
    it('blocks changing own role', () => {
      expect(
        selfChangeError('m1', manager, { role: UserRole.GROOM }),
      ).not.toBeNull();
    });

    it('blocks locking own account', () => {
      expect(
        selfChangeError('m1', manager, { status: UserStatus.LOCKED }),
      ).not.toBeNull();
    });

    it('allows no-op or changes on other users', () => {
      expect(
        selfChangeError('m1', manager, { role: UserRole.CLUB_MANAGER }),
      ).toBeNull();
      expect(
        selfChangeError('m2', manager, { status: UserStatus.LOCKED }),
      ).toBeNull();
    });
  });

  describe('removesActiveManager', () => {
    it('detects demoting an active manager', () => {
      expect(
        removesActiveManager(manager, { role: UserRole.HEAD_TRAINER }),
      ).toBe(true);
    });

    it('detects locking an active manager', () => {
      expect(
        removesActiveManager(manager, { status: UserStatus.INACTIVE }),
      ).toBe(true);
    });

    it('ignores non-manager users', () => {
      expect(
        removesActiveManager(
          { id: 'g', role: UserRole.GROOM, status: UserStatus.ACTIVE },
          { status: UserStatus.LOCKED },
        ),
      ).toBe(false);
    });
  });
});

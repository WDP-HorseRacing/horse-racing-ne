import { ACCESS_KEY } from '../../../common/constants/auth.constants';
import { UserRole } from '../../../common/enums/role.enum';
import { PerformanceController } from './performance.controller';

function rolesOf(method: keyof PerformanceController): UserRole[] {
  const handler: unknown = Object.getOwnPropertyDescriptor(
    PerformanceController.prototype,
    method,
  )?.value;
  return Reflect.getMetadata(ACCESS_KEY, handler as object) as UserRole[];
}

describe('PerformanceController access', () => {
  it('opens the per-session summary to every role except groom', () => {
    expect(rolesOf('sessions')).toEqual(
      expect.arrayContaining([
        UserRole.CLUB_MANAGER,
        UserRole.HEAD_TRAINER,
        UserRole.VETERINARIAN,
        UserRole.HORSE_OWNER,
      ]),
    );
    expect(rolesOf('sessions')).not.toContain(UserRole.GROOM);
  });

  it('keeps raw metric points to the staff, including the veterinarian', () => {
    expect(rolesOf('summary')).toContain(UserRole.VETERINARIAN);
    expect(rolesOf('summary')).not.toContain(UserRole.HORSE_OWNER);
    expect(rolesOf('summary')).not.toContain(UserRole.GROOM);
  });
});

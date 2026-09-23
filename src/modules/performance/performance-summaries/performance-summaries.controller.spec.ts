import { ACCESS_KEY } from '../../../common/constants/auth.constants';
import { UserRole } from '../../../common/enums/role.enum';
import { PerformanceSummariesController } from './performance-summaries.controller';

function rolesOf(method: keyof PerformanceSummariesController): UserRole[] {
  const handler: unknown = Object.getOwnPropertyDescriptor(
    PerformanceSummariesController.prototype,
    method,
  )?.value;
  return Reflect.getMetadata(ACCESS_KEY, handler as object) as UserRole[];
}

describe('PerformanceSummariesController access', () => {
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

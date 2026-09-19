import { ACCESS_KEY } from '../../../common/constants/auth.constants';
import { UserRole } from '../../../common/enums/role.enum';
import { HorseProfilesController } from './horse-profiles.controller';

function rolesOf(method: keyof HorseProfilesController): UserRole[] {
  const handler: unknown = Object.getOwnPropertyDescriptor(
    HorseProfilesController.prototype,
    method,
  )?.value;
  return Reflect.getMetadata(ACCESS_KEY, handler as object) as UserRole[];
}

describe('HorseProfilesController access', () => {
  it('lets every role read its permissions on a horse', () => {
    expect(rolesOf('permissions')).toEqual(
      expect.arrayContaining(Object.values(UserRole)),
    );
  });
});

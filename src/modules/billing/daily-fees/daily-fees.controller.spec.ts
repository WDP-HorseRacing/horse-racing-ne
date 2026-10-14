import { ACCESS_KEY } from '../../../common/constants/auth.constants';
import { UserRole } from '../../../common/enums/role.enum';
import { DailyFeesController } from './daily-fees.controller';

function rolesOf(method: keyof DailyFeesController): UserRole[] {
  const handler: unknown = Object.getOwnPropertyDescriptor(
    DailyFeesController.prototype,
    method,
  )?.value;
  return Reflect.getMetadata(ACCESS_KEY, handler as object) as UserRole[];
}

describe('DailyFeesController access', () => {
  it.each(['list', 'create', 'remove'] as const)(
    '%s is limited to the club manager',
    (method) => {
      expect(rolesOf(method)).toEqual([UserRole.CLUB_MANAGER]);
    },
  );
});

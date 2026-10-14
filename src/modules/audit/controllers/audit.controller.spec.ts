import { ACCESS_KEY } from '../../../common/constants/auth.constants';
import { UserRole } from '../../../common/enums/role.enum';
import { AuditController } from './audit.controller';

function rolesOf(method: keyof AuditController): UserRole[] {
  const handler: unknown = Object.getOwnPropertyDescriptor(
    AuditController.prototype,
    method,
  )?.value;
  return Reflect.getMetadata(ACCESS_KEY, handler as object) as UserRole[];
}

describe('AuditController access', () => {
  it.each(['list', 'get'] as const)(
    '%s is limited to the club manager',
    (method) => {
      expect(rolesOf(method)).toEqual([UserRole.CLUB_MANAGER]);
    },
  );
});

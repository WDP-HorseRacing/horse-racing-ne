import { ACCESS_KEY } from '../../../common/constants/auth.constants';
import { UserRole } from '../../../common/enums/role.enum';
import { SupplyRequestsController } from './requests.controller';

function rolesOf(method: keyof SupplyRequestsController): UserRole[] {
  const handler: unknown = Object.getOwnPropertyDescriptor(
    SupplyRequestsController.prototype,
    method,
  )?.value;
  return Reflect.getMetadata(ACCESS_KEY, handler as object) as UserRole[];
}

describe('SupplyRequestsController access', () => {
  it.each(['create', 'edit'] as const)(
    'lets head trainers, veterinarians and grooms %s a request',
    (method) => {
      expect(rolesOf(method)).toEqual([
        UserRole.HEAD_TRAINER,
        UserRole.VETERINARIAN,
        UserRole.GROOM,
      ]);
    },
  );

  it.each(['list', 'get'] as const)(
    'lets the club manager and every requester role %s requests',
    (method) => {
      expect(rolesOf(method)).toEqual([
        UserRole.CLUB_MANAGER,
        UserRole.HEAD_TRAINER,
        UserRole.VETERINARIAN,
        UserRole.GROOM,
      ]);
    },
  );

  it('lets only the club manager change the status', () => {
    expect(rolesOf('updateStatus')).toEqual([UserRole.CLUB_MANAGER]);
  });
});

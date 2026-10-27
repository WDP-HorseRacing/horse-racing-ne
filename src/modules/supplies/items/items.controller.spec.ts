import { ACCESS_KEY } from '../../../common/constants/auth.constants';
import { UserRole } from '../../../common/enums/role.enum';
import { SupplyItemsController } from './items.controller';

function rolesOf(method: keyof SupplyItemsController): UserRole[] {
  const handler: unknown = Object.getOwnPropertyDescriptor(
    SupplyItemsController.prototype,
    method,
  )?.value;
  return Reflect.getMetadata(ACCESS_KEY, handler as object) as UserRole[];
}

describe('SupplyItemsController access', () => {
  it('lets only the club manager receive stock', () => {
    expect(rolesOf('receive')).toEqual([UserRole.CLUB_MANAGER]);
  });

  it('lets every stable role take stock out', () => {
    expect(rolesOf('use')).toEqual([
      UserRole.CLUB_MANAGER,
      UserRole.HEAD_TRAINER,
      UserRole.VETERINARIAN,
      UserRole.GROOM,
    ]);
  });
});

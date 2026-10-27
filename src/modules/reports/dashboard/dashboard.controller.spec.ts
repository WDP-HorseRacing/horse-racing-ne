import { ACCESS_KEY } from '../../../common/constants/auth.constants';
import { UserRole } from '../../../common/enums/role.enum';
import { DashboardController } from './dashboard.controller';

describe('DashboardController access', () => {
  it('is open to the club manager, head trainers and vets', () => {
    const handler: unknown = Object.getOwnPropertyDescriptor(
      DashboardController.prototype,
      'get',
    )?.value;
    expect(Reflect.getMetadata(ACCESS_KEY, handler as object)).toEqual([
      UserRole.CLUB_MANAGER,
      UserRole.HEAD_TRAINER,
      UserRole.VETERINARIAN,
    ]);
  });
});

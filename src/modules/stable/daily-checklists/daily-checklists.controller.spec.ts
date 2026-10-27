import { ACCESS_KEY } from '../../../common/constants/auth.constants';
import { UserRole } from '../../../common/enums/role.enum';
import { DailyChecklistsController } from './daily-checklists.controller';

function rolesOf(method: keyof DailyChecklistsController): UserRole[] {
  const handler: unknown = Object.getOwnPropertyDescriptor(
    DailyChecklistsController.prototype,
    method,
  )?.value;
  return Reflect.getMetadata(ACCESS_KEY, handler as object) as UserRole[];
}

describe('DailyChecklistsController access', () => {
  it('lets only the club manager regenerate the checklists of today', () => {
    expect(rolesOf('regenerateToday')).toEqual([UserRole.CLUB_MANAGER]);
  });
});

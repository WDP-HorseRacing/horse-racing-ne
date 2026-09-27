import { ACCESS_KEY } from '../../../common/constants/auth.constants';
import { UserRole } from '../../../common/enums/role.enum';
import { CheckupsController } from '../care-schedules/checkups.controller';
import { MedicalDashboardController } from './medical-dashboard.controller';

/**
 * Đọc danh sách vai trò khai báo bằng @Access trên một method của controller.
 *
 * @param controller Class controller
 * @param method Tên method
 * @returns Danh sách vai trò được phép
 */
function rolesOf(
  controller: { prototype: object },
  method: string,
): UserRole[] {
  const handler = (controller.prototype as Record<string, object>)[method];
  return Reflect.getMetadata(ACCESS_KEY, handler) as UserRole[];
}

describe('dashboard and checkups controllers access', () => {
  it.each([
    [MedicalDashboardController, 'get'],
    [CheckupsController, 'list'],
  ])('lets vets, club managers and head trainers read (%p %s)', (c, m) => {
    const roles = rolesOf(c, m);
    expect(roles).toEqual([
      UserRole.VETERINARIAN,
      UserRole.CLUB_MANAGER,
      UserRole.HEAD_TRAINER,
    ]);
    expect(roles).not.toContain(UserRole.GROOM);
    expect(roles).not.toContain(UserRole.HORSE_OWNER);
  });

  it('lets only VETERINARIAN set an appointment', () => {
    expect(rolesOf(CheckupsController, 'setAppointment')).toEqual([
      UserRole.VETERINARIAN,
    ]);
  });
});

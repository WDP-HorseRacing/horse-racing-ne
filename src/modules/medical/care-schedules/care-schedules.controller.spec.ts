import { ACCESS_KEY } from '../../../common/constants/auth.constants';
import { UserRole } from '../../../common/enums/role.enum';
import { CareSchedulesController } from './care-schedules.controller';

/**
 * Đọc danh sách vai trò khai báo bằng @Access trên một method của controller.
 *
 * @param method Tên method
 * @returns Danh sách vai trò được phép
 */
function rolesOf(method: string): UserRole[] {
  const handler = (
    CareSchedulesController.prototype as unknown as Record<string, object>
  )[method];
  return Reflect.getMetadata(ACCESS_KEY, handler) as UserRole[];
}

describe('CareSchedulesController access', () => {
  it.each(['create', 'update', 'cancel'])('lets only VETERINARIAN %s', (m) => {
    expect(rolesOf(m)).toEqual([UserRole.VETERINARIAN]);
  });

  it('lets vets and grooms complete a task', () => {
    expect(rolesOf('complete')).toEqual([
      UserRole.VETERINARIAN,
      UserRole.GROOM,
    ]);
  });

  it('lets every role read the schedules', () => {
    expect(rolesOf('list')).toHaveLength(5);
  });
});

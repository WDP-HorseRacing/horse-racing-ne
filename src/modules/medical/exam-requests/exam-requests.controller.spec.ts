import { ACCESS_KEY } from '../../../common/constants/auth.constants';
import { UserRole } from '../../../common/enums/role.enum';
import { ExamRequestsController } from './exam-requests.controller';

/**
 * Đọc danh sách vai trò khai báo bằng @Access trên một method của controller.
 *
 * @param method Tên method
 * @returns Danh sách vai trò được phép
 */
function rolesOf(method: string): UserRole[] {
  const handler = (
    ExamRequestsController.prototype as unknown as Record<string, object>
  )[method];
  return Reflect.getMetadata(ACCESS_KEY, handler) as UserRole[];
}

describe('ExamRequestsController access', () => {
  it.each(['create', 'list', 'listByHorse'])(
    'lets staff and grooms %s but not horse owners',
    (method) => {
      expect(rolesOf(method)).toEqual([
        UserRole.VETERINARIAN,
        UserRole.CLUB_MANAGER,
        UserRole.HEAD_TRAINER,
        UserRole.GROOM,
      ]);
    },
  );

  it.each(['updateUrgency', 'dismiss'])(
    'lets only VETERINARIAN %s',
    (method) => {
      expect(rolesOf(method)).toEqual([UserRole.VETERINARIAN]);
    },
  );
});

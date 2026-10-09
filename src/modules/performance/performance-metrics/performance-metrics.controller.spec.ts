import { ACCESS_KEY } from '../../../common/constants/auth.constants';
import { UserRole } from '../../../common/enums/role.enum';
import { PerformanceMetricsController } from './performance-metrics.controller';

function rolesOf(method: keyof PerformanceMetricsController): UserRole[] {
  const handler: unknown = Object.getOwnPropertyDescriptor(
    PerformanceMetricsController.prototype,
    method,
  )?.value;
  return Reflect.getMetadata(ACCESS_KEY, handler as object) as UserRole[];
}

describe('PerformanceMetricsController access', () => {
  it('không cho Groom xem điểm đo thô của lượt tập', () => {
    const roles = rolesOf('list');
    expect(roles).toEqual(
      expect.arrayContaining([
        UserRole.CLUB_MANAGER,
        UserRole.VETERINARIAN,
        UserRole.HEAD_TRAINER,
      ]),
    );
    expect(roles).not.toContain(UserRole.GROOM);
  });

  it('cho Chủ ngựa xem tổng kết lượt tập nhưng không cho Groom', () => {
    const roles = rolesOf('summary');
    expect(roles).toEqual(
      expect.arrayContaining([
        UserRole.CLUB_MANAGER,
        UserRole.VETERINARIAN,
        UserRole.HEAD_TRAINER,
        UserRole.HORSE_OWNER,
      ]),
    );
    expect(roles).not.toContain(UserRole.GROOM);
  });
});

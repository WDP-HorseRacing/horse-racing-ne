import { ACCESS_KEY } from '../../../common/constants/auth.constants';
import { UserRole } from '../../../common/enums/role.enum';
import { PerformanceEvaluationsController } from './performance-evaluations.controller';

function rolesOf(method: keyof PerformanceEvaluationsController): UserRole[] {
  const handler: unknown = Object.getOwnPropertyDescriptor(
    PerformanceEvaluationsController.prototype,
    method,
  )?.value;
  return Reflect.getMetadata(ACCESS_KEY, handler as object) as UserRole[];
}

describe('PerformanceEvaluationsController access', () => {
  it('create is limited to the head trainer', () => {
    expect(rolesOf('create')).toEqual([UserRole.HEAD_TRAINER]);
  });

  it('get is open to every role that can read a participant', () => {
    expect(rolesOf('get')).toEqual([
      UserRole.CLUB_MANAGER,
      UserRole.VETERINARIAN,
      UserRole.HEAD_TRAINER,
      UserRole.GROOM,
      UserRole.HORSE_OWNER,
    ]);
  });
});

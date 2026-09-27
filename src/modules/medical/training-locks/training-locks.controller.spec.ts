import { ACCESS_KEY } from '../../../common/constants/auth.constants';
import { UserRole } from '../../../common/enums/role.enum';
import { HealthStatusesController } from '../health-statuses/health-statuses.controller';
import { TrainingLocksController } from './training-locks.controller';

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

const READERS = [
  UserRole.CLUB_MANAGER,
  UserRole.HEAD_TRAINER,
  UserRole.VETERINARIAN,
  UserRole.HORSE_OWNER,
];

describe('training locks and health status controllers access', () => {
  it.each([
    [TrainingLocksController, 'create'],
    [TrainingLocksController, 'release'],
    [HealthStatusesController, 'updateHealth'],
  ])('lets only VETERINARIAN write (%p %s)', (controller, method) => {
    expect(rolesOf(controller, method)).toEqual([UserRole.VETERINARIAN]);
  });

  it.each([
    [TrainingLocksController, 'locks'],
    [TrainingLocksController, 'lock'],
    [HealthStatusesController, 'history'],
  ])('lets readers except GROOM read (%p %s)', (controller, method) => {
    expect(rolesOf(controller, method)).toEqual(READERS);
  });
});

import { ACCESS_KEY } from '../../../common/constants/auth.constants';
import { UserRole } from '../../../common/enums/role.enum';
import { HorseReportsController } from './horse-reports.controller';

describe('HorseReportsController access', () => {
  it.each(['progress', 'health'])(
    '%s is open to the club manager, head trainers, vets and owners',
    (method) => {
      const handler: unknown = Object.getOwnPropertyDescriptor(
        HorseReportsController.prototype,
        method,
      )?.value;
      expect(Reflect.getMetadata(ACCESS_KEY, handler as object)).toEqual([
        UserRole.CLUB_MANAGER,
        UserRole.HEAD_TRAINER,
        UserRole.VETERINARIAN,
        UserRole.HORSE_OWNER,
      ]);
    },
  );
});

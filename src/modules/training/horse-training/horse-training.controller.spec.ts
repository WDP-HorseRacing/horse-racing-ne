import { ACCESS_KEY } from '../../../common/constants/auth.constants';
import { UserRole } from '../../../common/enums/role.enum';
import { HorseTrainingController } from './horse-training.controller';

function rolesOf(method: keyof HorseTrainingController): UserRole[] {
  const handler: unknown = Object.getOwnPropertyDescriptor(
    HorseTrainingController.prototype,
    method,
  )?.value;
  return Reflect.getMetadata(ACCESS_KEY, handler as object) as UserRole[];
}

describe('HorseTrainingController access (F1.3 training tab)', () => {
  it.each(['listClasses', 'listSessions'] as const)(
    '%s is open to CM, HT, VET and owner but not to groom',
    (method) => {
      expect(rolesOf(method)).toEqual([
        UserRole.CLUB_MANAGER,
        UserRole.HEAD_TRAINER,
        UserRole.VETERINARIAN,
        UserRole.HORSE_OWNER,
      ]);
      expect(rolesOf(method)).not.toContain(UserRole.GROOM);
    },
  );
});

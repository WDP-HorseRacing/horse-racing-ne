import { ACCESS_KEY } from '../../../common/constants/auth.constants';
import { UserRole } from '../../../common/enums/role.enum';
import { MedicalController } from './medical.controller';

function rolesOf(method: keyof MedicalController): UserRole[] {
  const handler: unknown = Object.getOwnPropertyDescriptor(
    MedicalController.prototype,
    method,
  )?.value;
  return Reflect.getMetadata(ACCESS_KEY, handler as object) as UserRole[];
}

describe('MedicalController access', () => {
  it('opens the medical records to a horse owner', () => {
    expect(rolesOf('listRecords')).toContain(UserRole.HORSE_OWNER);
  });

  it('keeps a groom out of the medical records', () => {
    expect(rolesOf('listRecords')).not.toContain(UserRole.GROOM);
  });

  it('opens the injury timeline to a horse owner but not a groom', () => {
    expect(rolesOf('listInjuries')).toContain(UserRole.HORSE_OWNER);
    expect(rolesOf('listInjuries')).not.toContain(UserRole.GROOM);
  });
});

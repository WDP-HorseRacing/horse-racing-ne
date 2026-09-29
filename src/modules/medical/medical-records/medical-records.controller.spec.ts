import { ACCESS_KEY } from '../../../common/constants/auth.constants';
import { UserRole } from '../../../common/enums/role.enum';
import { InjuryCasesController } from '../injury-cases/injury-cases.controller';
import { MedicalRecordsController } from './medical-records.controller';

function rolesOf(target: { prototype: object }, method: string): UserRole[] {
  const handler: unknown = Object.getOwnPropertyDescriptor(
    target.prototype,
    method,
  )?.value;
  return Reflect.getMetadata(ACCESS_KEY, handler as object) as UserRole[];
}

describe('Medical tab access', () => {
  it('opens the medical records to a horse owner', () => {
    expect(rolesOf(MedicalRecordsController, 'listRecords')).toContain(
      UserRole.HORSE_OWNER,
    );
  });

  it('keeps a groom out of the medical records', () => {
    expect(rolesOf(MedicalRecordsController, 'listRecords')).not.toContain(
      UserRole.GROOM,
    );
  });

  it('opens the injury timeline to a horse owner but not a groom', () => {
    expect(rolesOf(InjuryCasesController, 'listInjuries')).toContain(
      UserRole.HORSE_OWNER,
    );
    expect(rolesOf(InjuryCasesController, 'listInjuries')).not.toContain(
      UserRole.GROOM,
    );
  });
});

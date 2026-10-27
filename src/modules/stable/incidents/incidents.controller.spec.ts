import { ACCESS_KEY } from '../../../common/constants/auth.constants';
import { UserRole } from '../../../common/enums/role.enum';
import { IncidentsController } from './incidents.controller';

function rolesOf(method: keyof IncidentsController): UserRole[] {
  const handler: unknown = Object.getOwnPropertyDescriptor(
    IncidentsController.prototype,
    method,
  )?.value;
  return Reflect.getMetadata(ACCESS_KEY, handler as object) as UserRole[];
}

describe('IncidentsController access', () => {
  it('lets only grooms report an incident', () => {
    expect(rolesOf('report')).toEqual([UserRole.GROOM]);
  });
});

import { ACCESS_KEY } from '../../../common/constants/auth.constants';
import { UserRole } from '../../../common/enums/role.enum';
import { HorseMeasurementsController } from './horse-measurements.controller';

function rolesOf(method: keyof HorseMeasurementsController): UserRole[] {
  const handler: unknown = Object.getOwnPropertyDescriptor(
    HorseMeasurementsController.prototype,
    method,
  )?.value;
  return Reflect.getMetadata(ACCESS_KEY, handler as object) as UserRole[];
}

describe('HorseMeasurementsController access', () => {
  it('opens the measurement history to every role', () => {
    expect(rolesOf('measurements')).toEqual(
      expect.arrayContaining(Object.values(UserRole)),
    );
  });
});

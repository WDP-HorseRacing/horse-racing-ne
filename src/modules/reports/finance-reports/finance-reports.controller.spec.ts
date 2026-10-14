import { ACCESS_KEY } from '../../../common/constants/auth.constants';
import { UserRole } from '../../../common/enums/role.enum';
import { FinanceReportsController } from './finance-reports.controller';

const accessOf = (method: string): unknown => {
  const handler: unknown = Object.getOwnPropertyDescriptor(
    FinanceReportsController.prototype,
    method,
  )?.value;
  return Reflect.getMetadata(ACCESS_KEY, handler as object);
};

describe('FinanceReportsController access', () => {
  it('keeps the club finance to the club manager', () => {
    expect(accessOf('clubFinance')).toEqual([UserRole.CLUB_MANAGER]);
  });

  it('opens the owner costs to the club manager and owners', () => {
    expect(accessOf('ownerCost')).toEqual([
      UserRole.CLUB_MANAGER,
      UserRole.HORSE_OWNER,
    ]);
  });
});

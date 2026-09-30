import { ACCESS_KEY } from '../../../common/constants/auth.constants';
import { UserRole } from '../../../common/enums/role.enum';
import { InjuryCasesController } from '../injury-cases/injury-cases.controller';
import { MedicalCasesController } from './medical-cases.controller';
import { MedicalRecordsController } from './medical-records.controller';

/**
 * Đọc danh sách vai trò khai báo bằng @Access trên một handler.
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

describe('medical records and cases controllers access', () => {
  it.each([
    ['list visits', MedicalRecordsController, 'listRecords'],
    ['get visit', MedicalRecordsController, 'record'],
    ['list cases', MedicalCasesController, 'listCases'],
    ['get case', MedicalCasesController, 'getCase'],
    ['list injuries', InjuryCasesController, 'listInjuries'],
  ])('lets every reader except GROOM %s', (_label, controller, method) => {
    expect(rolesOf(controller, method)).toEqual(READERS);
    expect(rolesOf(controller, method)).not.toContain(UserRole.GROOM);
  });

  it('lets every reader and the groom read the current care instructions', () => {
    expect(rolesOf(MedicalRecordsController, 'careInstructions')).toEqual([
      ...READERS,
      UserRole.GROOM,
    ]);
  });

  it.each([
    ['record a visit', MedicalRecordsController, 'createRecord'],
    ['void a visit', MedicalRecordsController, 'voidRecord'],
    ['record a follow-up', MedicalCasesController, 'addVisit'],
    ['preview closing', MedicalCasesController, 'closePreview'],
    ['close a case', MedicalCasesController, 'close'],
    ['adjust the cost', MedicalCasesController, 'adjustCost'],
  ])('lets only VETERINARIAN %s', (_label, controller, method) => {
    expect(rolesOf(controller, method)).toEqual([UserRole.VETERINARIAN]);
  });

  it('lets only CLUB_MANAGER read the cost report', () => {
    expect(rolesOf(MedicalCasesController, 'costReport')).toEqual([
      UserRole.CLUB_MANAGER,
    ]);
  });
});

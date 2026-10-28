import { UserRole } from '../../../common/enums/role.enum';
import { UserStatus } from '../../../common/enums/user-status.enum';
import { EligibilityReason } from '../enums/eligibility-reason.enum';
import { HorseGender } from '../enums/horse-gender.enum';
import {
  HorseMeasurementAlert,
  HorseMeasurementAlertSeverity,
} from '../enums/horse-measurement-alert.enum';
import { HorseMeasurementType } from '../enums/horse-measurement-type.enum';
import { HorsePlacementStatus } from '../enums/horse-placement-status.enum';
import {
  HorseHealthStatus,
  HorseLifecycleStatus,
} from '../enums/horse-status.enum';
import type {
  EligibilityInput,
  HorsePermissionInput,
  HorsePermissions,
} from '../types/horse.types';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { HorseMeasurementSource } from '../enums/horse-measurement-source.enum';
import {
  assertAbnormalConfirmed,
  assertAssignableOwner,
  assertBarnChangeReason,
  assertBornBeforeChildren,
  assertDeletedHorse,
  assertLifecycleWritable,
  isActiveHorseOwner,
  assertDateOfBirth,
  assertDistinctMeasurementTypes,
  assertGenderKeepsPedigree,
  assertLifecycleTransition,
  assertLifecycleChanged,
  assertLifecycleOwner,
  microchipTakenMessage,
  assertMeasurementDeletable,
  assertMeasurementValue,
  assertNoBusinessData,
  assertNotParent,
  assertOwnerAssignment,
  assertParentIds,
  assertParentProfiles,
  barnChangeBlockedReason,
  barnChangeSummary,
  rebilledChargesSummary,
  restoreImpactSummary,
  canRecordMeasurement,
  evaluateEligibility,
  evaluateHorsePermissions,
  isHorseInScope,
  lifecycleImpactSummary,
  lifecycleSideEffects,
  lifecycleTransitionError,
  lifecycleUnchangedError,
  raceAptitudeFieldsIn,
  measurementAlerts,
  placementStatusOf,
  nonRaceAptitudeFieldsIn,
} from './horse.policy';

describe('horse.policy', () => {
  describe('evaluateEligibility', () => {
    const eligible: EligibilityInput = {
      isDeleted: false,
      lifecycleStatus: HorseLifecycleStatus.ACTIVE,
      healthStatus: HorseHealthStatus.ELIGIBLE,
      hasActiveTrainingLock: false,
    };

    it('allows training and racing for an active, healthy, unlocked horse', () => {
      expect(evaluateEligibility(eligible)).toEqual({
        trainingEligible: true,
        racingEligible: true,
        trainingReasons: [],
        racingReasons: [],
        reasons: [],
      });
    });

    it('blocks both when the profile is deleted', () => {
      expect(evaluateEligibility({ ...eligible, isDeleted: true })).toEqual({
        trainingEligible: false,
        racingEligible: false,
        trainingReasons: [EligibilityReason.PROFILE_DELETED],
        racingReasons: [EligibilityReason.PROFILE_DELETED],
        reasons: [EligibilityReason.PROFILE_DELETED],
      });
    });

    it('blocks both for a RETIRED horse with the retired reason', () => {
      expect(
        evaluateEligibility({
          ...eligible,
          lifecycleStatus: HorseLifecycleStatus.RETIRED,
        }),
      ).toEqual({
        trainingEligible: false,
        racingEligible: false,
        trainingReasons: [EligibilityReason.LIFECYCLE_RETIRED],
        racingReasons: [EligibilityReason.LIFECYCLE_RETIRED],
        reasons: [EligibilityReason.LIFECYCLE_RETIRED],
      });
    });

    it('blocks both for a TRANSFERRED horse with the transferred reason', () => {
      expect(
        evaluateEligibility({
          ...eligible,
          lifecycleStatus: HorseLifecycleStatus.TRANSFERRED,
        }),
      ).toEqual({
        trainingEligible: false,
        racingEligible: false,
        trainingReasons: [EligibilityReason.LIFECYCLE_TRANSFERRED],
        racingReasons: [EligibilityReason.LIFECYCLE_TRANSFERRED],
        reasons: [EligibilityReason.LIFECYCLE_TRANSFERRED],
      });
    });

    it('lets an UNDER_OBSERVATION horse train but not race', () => {
      expect(
        evaluateEligibility({
          ...eligible,
          healthStatus: HorseHealthStatus.UNDER_OBSERVATION,
        }),
      ).toEqual({
        trainingEligible: true,
        racingEligible: false,
        trainingReasons: [],
        racingReasons: [EligibilityReason.HEALTH_UNDER_OBSERVATION],
        reasons: [EligibilityReason.HEALTH_UNDER_OBSERVATION],
      });
    });

    it.each([
      [HorseHealthStatus.INJURED, EligibilityReason.HEALTH_INJURED],
      [HorseHealthStatus.QUARANTINED, EligibilityReason.HEALTH_QUARANTINED],
    ])('blocks both for health %s', (healthStatus, reason) => {
      expect(evaluateEligibility({ ...eligible, healthStatus })).toEqual({
        trainingEligible: false,
        racingEligible: false,
        trainingReasons: [reason],
        racingReasons: [reason],
        reasons: [reason],
      });
    });

    it('blocks both while a training lock is active', () => {
      expect(
        evaluateEligibility({ ...eligible, hasActiveTrainingLock: true }),
      ).toEqual({
        trainingEligible: false,
        racingEligible: false,
        trainingReasons: [EligibilityReason.ACTIVE_TRAINING_LOCK],
        racingReasons: [EligibilityReason.ACTIVE_TRAINING_LOCK],
        reasons: [EligibilityReason.ACTIVE_TRAINING_LOCK],
      });
    });

    it('gives each flag its own reasons: empty exactly when the flag is true (F1.3 mục 2)', () => {
      for (const healthStatus of Object.values(HorseHealthStatus)) {
        for (const lifecycleStatus of Object.values(HorseLifecycleStatus)) {
          for (const isDeleted of [false, true]) {
            for (const hasActiveTrainingLock of [false, true]) {
              const result = evaluateEligibility({
                isDeleted,
                lifecycleStatus,
                healthStatus,
                hasActiveTrainingLock,
              });
              expect(result.trainingReasons.length === 0).toBe(
                result.trainingEligible,
              );
              expect(result.racingReasons.length === 0).toBe(
                result.racingEligible,
              );
            }
          }
        }
      }
    });

    it('lists every blocking reason at once', () => {
      expect(
        evaluateEligibility({
          isDeleted: true,
          lifecycleStatus: HorseLifecycleStatus.RETIRED,
          healthStatus: HorseHealthStatus.INJURED,
          hasActiveTrainingLock: true,
        }).reasons,
      ).toEqual([
        EligibilityReason.PROFILE_DELETED,
        EligibilityReason.LIFECYCLE_RETIRED,
        EligibilityReason.HEALTH_INJURED,
        EligibilityReason.ACTIVE_TRAINING_LOCK,
      ]);
    });
  });

  describe('evaluateHorsePermissions', () => {
    const base: HorsePermissionInput = {
      roles: [],
      isDeleted: false,
      hasBarn: true,
      lifecycleStatus: HorseLifecycleStatus.ACTIVE,
      isInTrainerBarn: false,
      isAssignedGroom: false,
    };
    const permissionsOf = (input: Partial<HorsePermissionInput>) =>
      evaluateHorsePermissions({ ...base, ...input });
    const enabled = (permissions: HorsePermissions) =>
      Object.entries(permissions)
        .filter(([, value]) => value)
        .map(([key]) => key)
        .sort();

    it('hides the medical and training tabs from a GROOM', () => {
      const permissions = permissionsOf({
        roles: [UserRole.GROOM],
        isAssignedGroom: true,
      });
      expect(permissions.canViewMedicalTab).toBe(false);
      expect(permissions.canViewTrainingTab).toBe(false);
      expect(permissions.canViewPerformanceTab).toBe(false);
      expect(permissions.canRecordMeasurement).toBe(true);
    });

    it('hides the performance tab from a VETERINARIAN', () => {
      const permissions = permissionsOf({ roles: [UserRole.VETERINARIAN] });
      expect(permissions.canViewPerformanceTab).toBe(false);
      expect(permissions.canViewMedicalTab).toBe(true);
      expect(permissions.canViewTrainingTab).toBe(true);
      expect(permissions.canChangeHealth).toBe(true);
      expect(permissions.canDeleteMeasurement).toBe(true);
    });

    it('lets a CLUB_MANAGER edit the profile but not the race aptitude', () => {
      const permissions = permissionsOf({ roles: [UserRole.CLUB_MANAGER] });
      expect(permissions.canEditProfile).toBe(true);
      expect(permissions.canEditRaceAptitude).toBe(false);
      expect(permissions.canAssignBarn).toBe(true);
      expect(permissions.canAssignStallAndGroom).toBe(false);
      expect(permissions.canRecordMeasurement).toBe(false);
    });

    it('lets a HEAD_TRAINER in the barn edit the race aptitude and assign stall and groom', () => {
      const permissions = permissionsOf({
        roles: [UserRole.HEAD_TRAINER],
        isInTrainerBarn: true,
      });
      expect(permissions.canEditRaceAptitude).toBe(true);
      expect(permissions.canAssignStallAndGroom).toBe(true);
      expect(permissions.canEditProfile).toBe(false);
      expect(permissions.canRecordMeasurement).toBe(true);
    });

    it('does not let a HEAD_TRAINER assign stall and groom before the horse has a barn', () => {
      const permissions = permissionsOf({
        roles: [UserRole.HEAD_TRAINER],
        isInTrainerBarn: true,
        hasBarn: false,
      });
      expect(permissions.canAssignStallAndGroom).toBe(false);
      expect(permissions.canEditRaceAptitude).toBe(true);
    });

    it('gives a HEAD_TRAINER outside the barn no write permission', () => {
      const permissions = permissionsOf({ roles: [UserRole.HEAD_TRAINER] });
      expect(permissions.canEditRaceAptitude).toBe(false);
      expect(permissions.canAssignStallAndGroom).toBe(false);
      expect(permissions.canRecordMeasurement).toBe(false);
    });

    it('only leaves canRestore (plus the view tabs) on a deleted profile', () => {
      const permissions = permissionsOf({
        roles: [UserRole.CLUB_MANAGER],
        isDeleted: true,
      });
      expect(enabled(permissions)).toEqual([
        'canRestore',
        'canViewMedicalTab',
        'canViewPerformanceTab',
        'canViewTrainingTab',
      ]);
    });

    it('does not offer canRestore on a live profile', () => {
      expect(permissionsOf({ roles: [UserRole.CLUB_MANAGER] }).canRestore).toBe(
        false,
      );
    });

    it('keeps only canChangeLifecycle and canDeleteMeasurement on a TRANSFERRED horse', () => {
      const permissions = permissionsOf({
        roles: [
          UserRole.CLUB_MANAGER,
          UserRole.HEAD_TRAINER,
          UserRole.VETERINARIAN,
        ],
        lifecycleStatus: HorseLifecycleStatus.TRANSFERRED,
        isInTrainerBarn: true,
      });
      expect(permissions).toMatchObject({
        canChangeLifecycle: true,
        canEditProfile: false,
        canEditRaceAptitude: false,
        canAssignBarn: false,
        canAssignStallAndGroom: false,
        canDelete: false,
        canRestore: false,
        canChangeHealth: false,
        canRecordMeasurement: false,
        canDeleteMeasurement: true,
      });
    });

    it('lets a HORSE_OWNER only view the tabs', () => {
      expect(enabled(permissionsOf({ roles: [UserRole.HORSE_OWNER] }))).toEqual(
        ['canViewMedicalTab', 'canViewPerformanceTab', 'canViewTrainingTab'],
      );
    });
  });

  describe('canRecordMeasurement', () => {
    const scope = { isInTrainerBarn: false, isAssignedGroom: false };

    it('allows a VETERINARIAN on any horse', () => {
      expect(
        canRecordMeasurement({ ...scope, roles: [UserRole.VETERINARIAN] }),
      ).toBe(true);
    });

    it('allows a HEAD_TRAINER only in the barn', () => {
      expect(
        canRecordMeasurement({ ...scope, roles: [UserRole.HEAD_TRAINER] }),
      ).toBe(false);
      expect(
        canRecordMeasurement({
          ...scope,
          roles: [UserRole.HEAD_TRAINER],
          isInTrainerBarn: true,
        }),
      ).toBe(true);
    });

    it('allows a GROOM only when assigned', () => {
      expect(canRecordMeasurement({ ...scope, roles: [UserRole.GROOM] })).toBe(
        false,
      );
      expect(
        canRecordMeasurement({
          ...scope,
          roles: [UserRole.GROOM],
          isAssignedGroom: true,
        }),
      ).toBe(true);
    });

    it.each([UserRole.CLUB_MANAGER, UserRole.HORSE_OWNER])(
      'denies %s',
      (role) => {
        expect(
          canRecordMeasurement({
            roles: [role],
            isInTrainerBarn: true,
            isAssignedGroom: true,
          }),
        ).toBe(false);
      },
    );
  });

  describe('placementStatusOf', () => {
    it('returns NOT_APPLICABLE for a TRANSFERRED horse', () => {
      expect(
        placementStatusOf(HorseLifecycleStatus.TRANSFERRED, 'b1', 's1', 'g1'),
      ).toBe(HorsePlacementStatus.NOT_APPLICABLE);
    });

    it('returns PENDING_BARN without a barn', () => {
      expect(
        placementStatusOf(HorseLifecycleStatus.ACTIVE, null, null, null),
      ).toBe(HorsePlacementStatus.PENDING_BARN);
    });

    it('returns PENDING_STALL with a barn but no stall', () => {
      expect(
        placementStatusOf(HorseLifecycleStatus.RETIRED, 'b1', null, 'g1'),
      ).toBe(HorsePlacementStatus.PENDING_STALL);
    });

    it('returns PENDING_GROOM with a barn and stall but no groom', () => {
      expect(
        placementStatusOf(HorseLifecycleStatus.ACTIVE, 'b1', 's1', null),
      ).toBe(HorsePlacementStatus.PENDING_GROOM);
    });

    it('returns PLACED with barn, stall and groom', () => {
      expect(
        placementStatusOf(HorseLifecycleStatus.ACTIVE, 'b1', 's1', 'g1'),
      ).toBe(HorsePlacementStatus.PLACED);
    });
  });

  describe('lifecycleSideEffects', () => {
    const none = {
      withdrawFromClasses: false,
      withdrawRegistrations: false,
      releaseStall: false,
      endGroom: false,
      clearBarn: false,
      releaseTrainingLock: false,
      settleMedicalWork: false,
      closeIncidents: false,
      settleStableCare: false,
      resetHealth: false,
      reactivateFromTransfer: false,
      endOwnership: false,
    };
    const transferEffects = {
      endOwnership: true,
      releaseStall: true,
      endGroom: true,
      clearBarn: true,
      releaseTrainingLock: true,
      settleMedicalWork: true,
      closeIncidents: true,
      settleStableCare: true,
    };

    it('retires an ACTIVE horse by cancelling training and withdrawing registrations only', () => {
      expect(
        lifecycleSideEffects(
          HorseLifecycleStatus.ACTIVE,
          HorseLifecycleStatus.RETIRED,
        ),
      ).toEqual({
        ...none,
        withdrawFromClasses: true,
        withdrawRegistrations: true,
      });
    });

    it('transfers an ACTIVE horse with the retire effects plus the transfer effects', () => {
      expect(
        lifecycleSideEffects(
          HorseLifecycleStatus.ACTIVE,
          HorseLifecycleStatus.TRANSFERRED,
        ),
      ).toEqual({
        ...none,
        ...transferEffects,
        withdrawFromClasses: true,
        withdrawRegistrations: true,
      });
    });

    it('transfers a RETIRED horse withdrawing its classes but not its registrations', () => {
      expect(
        lifecycleSideEffects(
          HorseLifecycleStatus.RETIRED,
          HorseLifecycleStatus.TRANSFERRED,
        ),
      ).toEqual({ ...none, ...transferEffects, withdrawFromClasses: true });
    });

    it('keeps the health when reactivating from RETIRED', () => {
      expect(
        lifecycleSideEffects(
          HorseLifecycleStatus.RETIRED,
          HorseLifecycleStatus.ACTIVE,
        ),
      ).toEqual(none);
    });

    it('resets health and marks the reactivation from a transfer', () => {
      expect(
        lifecycleSideEffects(
          HorseLifecycleStatus.TRANSFERRED,
          HorseLifecycleStatus.ACTIVE,
        ),
      ).toEqual({ ...none, resetHealth: true, reactivateFromTransfer: true });
    });

    it.each([
      [HorseLifecycleStatus.ACTIVE, HorseLifecycleStatus.TRANSFERRED, true],
      [HorseLifecycleStatus.RETIRED, HorseLifecycleStatus.TRANSFERRED, true],
      [HorseLifecycleStatus.ACTIVE, HorseLifecycleStatus.DECEASED, true],
      [HorseLifecycleStatus.RETIRED, HorseLifecycleStatus.DECEASED, true],
      [HorseLifecycleStatus.ACTIVE, HorseLifecycleStatus.RETIRED, false],
      [HorseLifecycleStatus.RETIRED, HorseLifecycleStatus.ACTIVE, false],
      [HorseLifecycleStatus.TRANSFERRED, HorseLifecycleStatus.ACTIVE, false],
    ])('settles stable care from %s to %s: %s', (from, to, expected) => {
      expect(lifecycleSideEffects(from, to).settleStableCare).toBe(expected);
    });
  });

  describe('raceAptitudeFieldsIn / nonRaceAptitudeFieldsIn', () => {
    it('returns raceAptitude only when it is sent', () => {
      expect(
        raceAptitudeFieldsIn({
          name: 'Gió',
          raceAptitude: 'SPRINTER',
          color: undefined,
        }),
      ).toEqual(['raceAptitude']);
      expect(
        raceAptitudeFieldsIn({ name: 'Gió', raceAptitude: undefined }),
      ).toEqual([]);
    });

    it('returns every sent field except raceAptitude', () => {
      expect(
        nonRaceAptitudeFieldsIn({
          raceAptitude: 'MILER',
          name: 'Gió',
          ownerId: null,
          color: undefined,
        }),
      ).toEqual(['name', 'ownerId']);
      expect(nonRaceAptitudeFieldsIn({ raceAptitude: 'MILER' })).toEqual([]);
    });
  });

  describe('assertDistinctMeasurementTypes', () => {
    it('accepts distinct types', () => {
      expect(() =>
        assertDistinctMeasurementTypes([
          HorseMeasurementType.WEIGHT,
          HorseMeasurementType.TEMPERATURE,
        ]),
      ).not.toThrow();
    });

    it('rejects a repeated type with 400', () => {
      expect(() =>
        assertDistinctMeasurementTypes([
          HorseMeasurementType.WEIGHT,
          HorseMeasurementType.WEIGHT,
        ]),
      ).toThrow(
        new BadRequestException(
          'Mỗi loại chỉ số chỉ ghi một giá trị trong một lần đo',
        ),
      );
    });
  });

  describe('assertParentIds', () => {
    it('accepts different parents that are not the child', () => {
      expect(() => assertParentIds('c', 's', 'd')).not.toThrow();
      expect(() => assertParentIds(undefined, null, null)).not.toThrow();
    });

    it('rejects the child as its own parent with 400', () => {
      expect(() => assertParentIds('c', 'c', null)).toThrow(
        new BadRequestException('Ngựa không thể là cha/mẹ của chính nó'),
      );
      expect(() => assertParentIds('c', null, 'c')).toThrow(
        BadRequestException,
      );
    });

    it('rejects the same horse as sire and dam with 400', () => {
      expect(() => assertParentIds(undefined, 'x', 'x')).toThrow(
        new BadRequestException('Ngựa cha và ngựa mẹ không được trùng nhau'),
      );
    });

    it.each([
      ['sireId', 'c', null, 'Ngựa không thể là cha/mẹ của chính nó'],
      ['damId', null, 'c', 'Ngựa không thể là cha/mẹ của chính nó'],
      ['damId', 'x', 'x', 'Ngựa cha và ngựa mẹ không được trùng nhau'],
    ])(
      'attaches the parent error to the %s field',
      (field, sireId, damId, message) => {
        try {
          assertParentIds('c', sireId, damId);
          throw new Error('expected assertParentIds to throw');
        } catch (error) {
          expect((error as BadRequestException).getResponse()).toEqual({
            message,
            errors: [{ field, message }],
          });
        }
      },
    );
  });

  describe('assertParentProfiles', () => {
    const child = { dateOfBirth: '2022-01-01' };
    const stallion = {
      id: 's',
      gender: HorseGender.MALE,
      dateOfBirth: '2015-01-01',
    };
    const mare = {
      id: 'd',
      gender: HorseGender.FEMALE,
      dateOfBirth: '2016-01-01',
    };

    it('accepts a male or gelding sire and a female dam born before the child', () => {
      expect(() => assertParentProfiles(child, stallion, mare)).not.toThrow();
      expect(() =>
        assertParentProfiles(
          child,
          { ...stallion, gender: HorseGender.GELDING },
          null,
        ),
      ).not.toThrow();
    });

    it('rejects a female sire', () => {
      expect(() =>
        assertParentProfiles(
          child,
          { ...stallion, gender: HorseGender.FEMALE },
          null,
        ),
      ).toThrow(new BadRequestException('Ngựa cha phải là ngựa đực'));
    });

    it('rejects a non-female dam', () => {
      expect(() =>
        assertParentProfiles(child, null, {
          ...mare,
          gender: HorseGender.MALE,
        }),
      ).toThrow(new BadRequestException('Ngựa mẹ phải là ngựa cái'));
    });

    it('accepts a parent born exactly 2 years before the child', () => {
      expect(() =>
        assertParentProfiles({ dateOfBirth: '2024-05-10' }, null, {
          ...mare,
          dateOfBirth: '2022-05-10',
        }),
      ).not.toThrow();
    });

    it('rejects a dam less than 2 years older on the damId field', () => {
      const message = 'Ngựa mẹ phải lớn hơn ngựa con ít nhất 2 tuổi';
      expect(() =>
        assertParentProfiles({ dateOfBirth: '2024-05-10' }, null, {
          ...mare,
          dateOfBirth: '2022-05-11',
        }),
      ).toThrow(new BadRequestException(message));
      try {
        assertParentProfiles({ dateOfBirth: '2024-05-10' }, null, {
          ...mare,
          dateOfBirth: '2022-05-11',
        });
      } catch (error) {
        expect((error as BadRequestException).getResponse()).toEqual({
          message,
          errors: [{ field: 'damId', message }],
        });
      }
    });

    it('rejects a sire less than 2 years older', () => {
      expect(() =>
        assertParentProfiles(
          child,
          { ...stallion, dateOfBirth: '2020-06-01' },
          null,
        ),
      ).toThrow(
        new BadRequestException(
          'Ngựa cha phải lớn hơn ngựa con ít nhất 2 tuổi',
        ),
      );
    });

    it('skips the sire age gap when the sire has no date of birth', () => {
      expect(() =>
        assertParentProfiles(child, { ...stallion, dateOfBirth: null }, mare),
      ).not.toThrow();
    });

    it('skips the birth-date check when a date is missing', () => {
      expect(() =>
        assertParentProfiles({ dateOfBirth: null }, stallion, mare),
      ).not.toThrow();
    });
  });

  describe('assertDateOfBirth', () => {
    const today = '2026-10-06';
    const tooYoung =
      'Ngày sinh không hợp lệ: câu lạc bộ chỉ nhận ngựa đủ 1 tuổi trở lên';
    const tooOld = 'Ngày sinh không hợp lệ: ngựa không thể quá 40 tuổi';

    it('accepts both age bounds and a missing date', () => {
      expect(() => assertDateOfBirth('2025-10-06', today)).not.toThrow();
      expect(() => assertDateOfBirth('1986-10-06', today)).not.toThrow();
      expect(() => assertDateOfBirth(null, today)).not.toThrow();
      expect(() => assertDateOfBirth(undefined, today)).not.toThrow();
    });

    it('rejects a horse younger than 1 year on the dateOfBirth field', () => {
      expect(() => assertDateOfBirth('2025-10-07', today)).toThrow(
        new BadRequestException(tooYoung),
      );
      expect(() => assertDateOfBirth('2026-10-07', today)).toThrow(
        new BadRequestException(tooYoung),
      );
      try {
        assertDateOfBirth('2025-10-07', today);
      } catch (error) {
        expect((error as BadRequestException).getResponse()).toEqual({
          message: tooYoung,
          errors: [{ field: 'dateOfBirth', message: tooYoung }],
        });
      }
    });

    it('rejects a horse older than 40 years', () => {
      expect(() => assertDateOfBirth('1986-10-05', today)).toThrow(
        new BadRequestException(tooOld),
      );
    });

    it('uses 28 February a year earlier when today is 29 February', () => {
      expect(() => assertDateOfBirth('2027-02-28', '2028-02-29')).not.toThrow();
      expect(() => assertDateOfBirth('2027-03-01', '2028-02-29')).toThrow(
        new BadRequestException(tooYoung),
      );
    });
  });

  describe('assertBornBeforeChildren', () => {
    it('accepts a date before the earliest child or a missing date', () => {
      expect(() =>
        assertBornBeforeChildren('2015-01-01', '2020-01-01'),
      ).not.toThrow();
      expect(() => assertBornBeforeChildren(null, '2020-01-01')).not.toThrow();
      expect(() => assertBornBeforeChildren('2015-01-01', null)).not.toThrow();
    });

    it('accepts a date exactly 2 years before the earliest child', () => {
      expect(() =>
        assertBornBeforeChildren('2022-05-10', '2024-05-10'),
      ).not.toThrow();
    });

    it('rejects a date less than 2 years before the earliest child with 400', () => {
      expect(() =>
        assertBornBeforeChildren('2023-01-01', '2024-05-10'),
      ).toThrow(
        new BadRequestException(
          'Ngày sinh này phải trước ngày sinh của ngựa con sớm nhất ít nhất 2 năm',
        ),
      );
    });
  });

  describe('assertGenderKeepsPedigree', () => {
    it('lets a horse with no children change gender freely', () => {
      const usage = { asSire: false, asDam: false };
      expect(() =>
        assertGenderKeepsPedigree(usage, HorseGender.FEMALE),
      ).not.toThrow();
      expect(() =>
        assertGenderKeepsPedigree(usage, HorseGender.MALE),
      ).not.toThrow();
    });

    it('keeps a sire male or gelding (409)', () => {
      const usage = { asSire: true, asDam: false };
      expect(() =>
        assertGenderKeepsPedigree(usage, HorseGender.GELDING),
      ).not.toThrow();
      expect(() =>
        assertGenderKeepsPedigree(usage, HorseGender.FEMALE),
      ).toThrow(ConflictException);
    });

    it('keeps a dam female (409)', () => {
      const usage = { asSire: false, asDam: true };
      expect(() =>
        assertGenderKeepsPedigree(usage, HorseGender.FEMALE),
      ).not.toThrow();
      expect(() => assertGenderKeepsPedigree(usage, HorseGender.MALE)).toThrow(
        ConflictException,
      );
    });
  });

  describe('assertNotParent', () => {
    it("lets a horse that is nobody's parent through", () => {
      expect(() =>
        assertNotParent({ asSire: false, asDam: false }),
      ).not.toThrow();
    });

    it.each([
      { asSire: true, asDam: false },
      { asSire: false, asDam: true },
    ])('blocks a parent with 409 (%o)', (usage) => {
      expect(() => assertNotParent(usage)).toThrow(ConflictException);
    });
  });

  describe('assertNoBusinessData', () => {
    it('lets a horse without business data through', () => {
      expect(() => assertNoBusinessData([])).not.toThrow();
    });

    it('blocks with 409 and lists the labels', () => {
      expect(() => assertNoBusinessData(['bệnh án', 'chỉ số cơ thể'])).toThrow(
        new ConflictException(
          'Ngựa đã phát sinh dữ liệu nghiệp vụ (bệnh án, chỉ số cơ thể), hãy đổi trạng thái vòng đời thay vì xóa',
        ),
      );
    });
  });

  describe('lifecycle transitions', () => {
    it.each([
      [HorseLifecycleStatus.ACTIVE, HorseLifecycleStatus.RETIRED],
      [HorseLifecycleStatus.ACTIVE, HorseLifecycleStatus.TRANSFERRED],
      [HorseLifecycleStatus.RETIRED, HorseLifecycleStatus.ACTIVE],
      [HorseLifecycleStatus.RETIRED, HorseLifecycleStatus.TRANSFERRED],
      [HorseLifecycleStatus.TRANSFERRED, HorseLifecycleStatus.ACTIVE],
    ])('allows %s -> %s', (from, to) => {
      expect(lifecycleTransitionError(from, to)).toBeNull();
      expect(() => assertLifecycleTransition(from, to)).not.toThrow();
    });

    it('blocks TRANSFERRED -> RETIRED with 409 and a reason', () => {
      const from = HorseLifecycleStatus.TRANSFERRED;
      const to = HorseLifecycleStatus.RETIRED;
      expect(lifecycleTransitionError(from, to)).toBe(
        'Không thể chuyển vòng đời từ Đã chuyển nhượng sang Đã giải nghệ',
      );
      expect(() => assertLifecycleTransition(from, to)).toThrow(
        ConflictException,
      );
    });
  });

  describe('lifecycle unchanged', () => {
    it.each([
      [HorseLifecycleStatus.ACTIVE, 'Đang hoạt động'],
      [HorseLifecycleStatus.RETIRED, 'Đã giải nghệ'],
      [HorseLifecycleStatus.TRANSFERRED, 'Đã chuyển nhượng'],
      [HorseLifecycleStatus.DECEASED, 'Đã mất'],
    ])(
      'blocks %s -> same status with 409 naming horse and status',
      (status, label) => {
        const message = `Ngựa Winx đã ở trạng thái ${label}`;
        expect(lifecycleUnchangedError('Winx', status, status)).toBe(message);
        expect(() => assertLifecycleChanged('Winx', status, status)).toThrow(
          new ConflictException(message),
        );
      },
    );

    it('lets a different status through', () => {
      const from = HorseLifecycleStatus.DECEASED;
      const to = HorseLifecycleStatus.ACTIVE;
      expect(lifecycleUnchangedError('Winx', from, to)).toBeNull();
      expect(() => assertLifecycleChanged('Winx', from, to)).not.toThrow();
    });
  });

  describe('lifecycleImpactSummary', () => {
    const impact = {
      activeClasses: 2,
      openRaceRegistrations: 1,
      stallCode: 'A-01',
      groomName: 'Lan',
      barnName: 'Khu A',
      hasActiveTrainingLock: true,
      ownerName: null,
      examRequestsToDismiss: 0,
      careSchedulesToCancel: 0,
      openIncidents: 0,
      feedingPlansToArchive: 0,
      draftFeedingPlansToDelete: 0,
      careTasksToEnd: 0,
      careTasksToDelete: 0,
      checklistToCancel: false,
    };

    it('lists the facts and the actions of a retirement', () => {
      expect(
        lifecycleImpactSummary(
          'Winx',
          HorseLifecycleStatus.RETIRED,
          lifecycleSideEffects(
            HorseLifecycleStatus.ACTIVE,
            HorseLifecycleStatus.RETIRED,
          ),
          impact,
        ),
      ).toBe(
        'Winx đang có 2 lớp đang học, 1 đăng ký thi đấu chưa diễn ra. Nếu giải nghệ sẽ rút khỏi lớp, rút khỏi giải.',
      );
    });

    it('mentions the medical work closed by a transfer', () => {
      expect(
        lifecycleImpactSummary(
          'Winx',
          HorseLifecycleStatus.TRANSFERRED,
          lifecycleSideEffects(
            HorseLifecycleStatus.RETIRED,
            HorseLifecycleStatus.TRANSFERRED,
          ),
          {
            ...impact,
            stallCode: null,
            groomName: null,
            barnName: null,
            activeClasses: 0,
            hasActiveTrainingLock: false,
            examRequestsToDismiss: 2,
            careSchedulesToCancel: 1,
          },
        ),
      ).toBe(
        'Winx đang có 2 yêu cầu khám đang chờ, 1 lịch hẹn khám hoặc lịch chăm sóc chưa làm. Nếu chuyển nhượng sẽ bỏ qua yêu cầu khám, hủy các lịch đó.',
      );
    });

    it('mentions the open incidents closed by a death', () => {
      expect(
        lifecycleImpactSummary(
          'Winx',
          HorseLifecycleStatus.DECEASED,
          lifecycleSideEffects(
            HorseLifecycleStatus.RETIRED,
            HorseLifecycleStatus.DECEASED,
          ),
          {
            ...impact,
            stallCode: null,
            groomName: null,
            barnName: null,
            activeClasses: 0,
            hasActiveTrainingLock: false,
            openIncidents: 2,
          },
        ),
      ).toMatch(
        /^Winx đang có 2 sự cố đang mở\. Nếu .* sẽ đóng các sự cố đó\.$/,
      );
    });

    it('mentions the stable care settled by a death', () => {
      expect(
        lifecycleImpactSummary(
          'Winx',
          HorseLifecycleStatus.DECEASED,
          lifecycleSideEffects(
            HorseLifecycleStatus.RETIRED,
            HorseLifecycleStatus.DECEASED,
          ),
          {
            ...impact,
            stallCode: null,
            groomName: null,
            barnName: null,
            activeClasses: 0,
            hasActiveTrainingLock: false,
            feedingPlansToArchive: 1,
            draftFeedingPlansToDelete: 1,
            careTasksToEnd: 2,
            careTasksToDelete: 1,
            checklistToCancel: true,
          },
        ),
      ).toBe(
        'Winx đang có khẩu phần đang áp dụng, 1 bản nháp khẩu phần, 2 việc riêng đang áp dụng, 1 việc riêng chưa bắt đầu, checklist hôm nay chưa xong. Nếu ghi nhận đã mất sẽ lưu trữ khẩu phần, xóa các bản nháp đó, kết thúc các việc riêng đó ở hôm nay, xóa các việc riêng chưa bắt đầu, hủy checklist hôm nay.',
      );
    });

    it('does not mention stable care when retiring', () => {
      expect(
        lifecycleImpactSummary(
          'Winx',
          HorseLifecycleStatus.RETIRED,
          lifecycleSideEffects(
            HorseLifecycleStatus.ACTIVE,
            HorseLifecycleStatus.RETIRED,
          ),
          { ...impact, feedingPlansToArchive: 1, checklistToCancel: true },
        ),
      ).not.toMatch(/khẩu phần|checklist/);
    });

    it('says nothing else changes when a retired horse comes back', () => {
      expect(
        lifecycleImpactSummary(
          'Winx',
          HorseLifecycleStatus.ACTIVE,
          lifecycleSideEffects(
            HorseLifecycleStatus.RETIRED,
            HorseLifecycleStatus.ACTIVE,
          ),
          impact,
        ),
      ).toBe('Nếu kích hoạt lại sẽ không ảnh hưởng dữ liệu nào khác.');
    });

    it('states the health reset when a transferred horse comes back', () => {
      expect(
        lifecycleImpactSummary(
          'Winx',
          HorseLifecycleStatus.ACTIVE,
          lifecycleSideEffects(
            HorseLifecycleStatus.TRANSFERRED,
            HorseLifecycleStatus.ACTIVE,
          ),
          impact,
        ),
      ).toContain('đặt sức khỏe về Cách ly tới khi bác sĩ khám lại');
    });
  });

  describe('assertMeasurementValue', () => {
    it('accepts a value inside the allowed range', () => {
      expect(() =>
        assertMeasurementValue(HorseMeasurementType.TEMPERATURE, 38),
      ).not.toThrow();
    });

    it('rejects a value outside the allowed range with 400', () => {
      expect(() =>
        assertMeasurementValue(HorseMeasurementType.TEMPERATURE, 100),
      ).toThrow(BadRequestException);
    });
  });

  describe('assertAbnormalConfirmed', () => {
    const fever = [{ type: HorseMeasurementType.TEMPERATURE, value: 40 }];

    it('asks for confirmation (422) before saving an abnormal value', () => {
      expect(() => assertAbnormalConfirmed(fever, false)).toThrow(
        UnprocessableEntityException,
      );
    });

    it('lets a confirmed abnormal value through', () => {
      expect(() => assertAbnormalConfirmed(fever, true)).not.toThrow();
    });
  });

  describe('assertMeasurementDeletable', () => {
    it('lets a manual record be deleted', () => {
      expect(() =>
        assertMeasurementDeletable(HorseMeasurementSource.MANUAL),
      ).not.toThrow();
    });

    it('blocks a record from a medical exam with 409', () => {
      expect(() =>
        assertMeasurementDeletable(HorseMeasurementSource.MEDICAL_EXAM),
      ).toThrow(ConflictException);
    });
  });

  describe('isHorseInScope', () => {
    it('lets the ALL scope see every horse', () => {
      expect(isHorseInScope({ ownerId: null }, { kind: 'ALL' })).toBe(true);
    });

    it('limits an owner to horses they own', () => {
      const scope = { kind: 'OWNER', userId: 'o1' } as const;
      expect(isHorseInScope({ ownerId: 'o1' }, scope)).toBe(true);
      expect(isHorseInScope({ ownerId: 'o2' }, scope)).toBe(false);
      expect(isHorseInScope({ ownerId: null }, scope)).toBe(false);
    });
  });

  describe('measurementAlerts', () => {
    it('does not raise a fever alert at exactly 38.6', () => {
      expect(
        measurementAlerts(HorseMeasurementType.TEMPERATURE, 38.6, null),
      ).toEqual([]);
    });

    it('raises an URGENT fever alert above 38.6', () => {
      expect(
        measurementAlerts(HorseMeasurementType.TEMPERATURE, 38.61, null),
      ).toEqual([
        {
          alert: HorseMeasurementAlert.FEVER,
          severity: HorseMeasurementAlertSeverity.URGENT,
        },
      ]);
    });

    it('does not raise a weight drop alert at exactly 5%', () => {
      expect(measurementAlerts(HorseMeasurementType.WEIGHT, 475, 500)).toEqual(
        [],
      );
    });

    it('raises a WARNING weight drop alert above 5%', () => {
      expect(measurementAlerts(HorseMeasurementType.WEIGHT, 474, 500)).toEqual([
        {
          alert: HorseMeasurementAlert.WEIGHT_DROP,
          severity: HorseMeasurementAlertSeverity.WARNING,
          baselineValue: 500,
          dropPercent: 5.2,
        },
      ]);
    });

    it('skips the weight comparison without a baseline', () => {
      expect(measurementAlerts(HorseMeasurementType.WEIGHT, 300, null)).toEqual(
        [],
      );
    });
  });

  describe('barnChangeBlockedReason', () => {
    it('allows a move to another barn', () => {
      expect(
        barnChangeBlockedReason(HorseLifecycleStatus.ACTIVE, 'b1', 'b2'),
      ).toBeNull();
    });

    it('blocks a TRANSFERRED horse and a move to the same barn', () => {
      expect(
        barnChangeBlockedReason(HorseLifecycleStatus.TRANSFERRED, 'b1', 'b2'),
      ).toBe('Ngựa đã chuyển nhượng, hồ sơ chỉ đọc');
      expect(
        barnChangeBlockedReason(HorseLifecycleStatus.ACTIVE, 'b1', 'b1'),
      ).toBe('Ngựa đang ở khu này');
    });
  });

  describe('barnChangeSummary', () => {
    it('mentions only the consequences that exist', () => {
      expect(
        barnChangeSummary('Winx', 'Khu C', null, {
          fromBarnName: null,
          stallCode: null,
          groomName: null,
          classesToWithdraw: 0,
        }),
      ).toBe(
        'Nếu chuyển Winx sang Khu C, ngựa vào danh sách Chờ xếp ô của khu mới.',
      );
    });

    it('splits the consequences into separate sentences', () => {
      expect(
        barnChangeSummary('Winx', 'Khu C', 'Hoa', {
          fromBarnName: 'Khu A',
          stallCode: 'A-01',
          groomName: 'Lan',
          classesToWithdraw: 2,
        }),
      ).toBe(
        'Nếu chuyển Winx sang Khu C sẽ trả ô A-01 và rút khỏi 2 lớp. Groom Lan giữ nguyên. Ngựa vào danh sách Chờ xếp ô của Huấn luyện viên trưởng Hoa.',
      );
    });

    it('keeps the groom sentence when nothing else changes', () => {
      expect(
        barnChangeSummary('Winx', 'Khu C', 'Hoa', {
          fromBarnName: 'Khu A',
          stallCode: null,
          groomName: 'Lan',
          classesToWithdraw: 0,
        }),
      ).toBe(
        'Nếu chuyển Winx sang Khu C, ngựa vào danh sách Chờ xếp ô của Huấn luyện viên trưởng Hoa. Groom Lan giữ nguyên.',
      );
    });
  });

  describe('assertBarnChangeReason', () => {
    it('lets a horse waiting for a barn be placed without a reason', () => {
      expect(() => assertBarnChangeReason(null, undefined)).not.toThrow();
    });

    it('requires a reason to move a horse that already has a barn', () => {
      expect(() => assertBarnChangeReason('b1', undefined)).toThrow(
        new BadRequestException('Đổi khu bắt buộc nhập lý do'),
      );
      expect(() => assertBarnChangeReason('b1', 'Cân bằng khu')).not.toThrow();
    });
  });

  describe('assertAssignableOwner', () => {
    it('rejects a missing account or an account that is not a horse owner with 400', () => {
      expect(() => assertAssignableOwner(null)).toThrow(BadRequestException);
      expect(() =>
        assertAssignableOwner({
          role: UserRole.GROOM,
          status: UserStatus.ACTIVE,
        }),
      ).toThrow(BadRequestException);
    });

    it('rejects a horse owner who is no longer active with 409', () => {
      expect(() =>
        assertAssignableOwner({
          role: UserRole.HORSE_OWNER,
          status: UserStatus.LOCKED,
        }),
      ).toThrow(ConflictException);
    });

    it('accepts an active horse owner', () => {
      expect(() =>
        assertAssignableOwner({
          role: UserRole.HORSE_OWNER,
          status: UserStatus.ACTIVE,
        }),
      ).not.toThrow();
    });
  });

  describe('restoreImpactSummary', () => {
    it('names the barn left and the owner cleared', () => {
      expect(restoreImpactSummary('Winx', 'Khu A', 'Trần Văn Chủ')).toBe(
        'Nếu khôi phục, Winx sẽ rời khu "Khu A" và vào Chờ xếp khu, bỏ trống chủ sở hữu Trần Văn Chủ.',
      );
    });

    it('says the profile comes back unchanged when nothing is cleared', () => {
      expect(restoreImpactSummary('Winx', null, null)).toBe(
        'Nếu khôi phục, Winx trở lại như trước khi xóa.',
      );
    });
  });

  describe('rebilledChargesSummary', () => {
    it('names the owner with the daily fee days and the surcharge', () => {
      expect(
        rebilledChargesSummary(
          { billedDays: 29, dailyFee: 2900000, surcharge: 150000 },
          'Trần Văn Chủ',
        ),
      ).toBe(
        'Báo cáo phí sẽ tính lại cho chủ Trần Văn Chủ: phí ngày 29 ngày (2.900.000 đ), phụ phí 150.000 đ.',
      );
    });

    it('puts the fees of a horse without owner into the unowned line', () => {
      expect(
        rebilledChargesSummary(
          { billedDays: 3, dailyFee: 300000, surcharge: 0 },
          null,
        ),
      ).toBe(
        'Báo cáo phí sẽ tính lại vào mục Chưa có chủ: phí ngày 3 ngày (300.000 đ).',
      );
    });

    it('returns null when nothing will be billed again', () => {
      expect(
        rebilledChargesSummary(
          { billedDays: 0, dailyFee: 0, surcharge: 0 },
          'Trần Văn Chủ',
        ),
      ).toBeNull();
    });
  });

  describe('isActiveHorseOwner', () => {
    it('is true only for an active HORSE_OWNER account', () => {
      expect(
        isActiveHorseOwner({
          role: UserRole.HORSE_OWNER,
          status: UserStatus.ACTIVE,
        }),
      ).toBe(true);
      expect(
        isActiveHorseOwner({
          role: UserRole.HORSE_OWNER,
          status: UserStatus.INACTIVE,
        }),
      ).toBe(false);
      expect(
        isActiveHorseOwner({ role: UserRole.GROOM, status: UserStatus.ACTIVE }),
      ).toBe(false);
      expect(isActiveHorseOwner(null)).toBe(false);
    });
  });

  describe('assertDeletedHorse', () => {
    it('answers 404 when the horse does not exist', () => {
      expect(() => assertDeletedHorse(null)).toThrow(NotFoundException);
    });

    it('answers 409 when the horse is not deleted', () => {
      expect(() => assertDeletedHorse({ deletedAt: null })).toThrow(
        ConflictException,
      );
    });

    it('passes a deleted horse', () => {
      expect(() =>
        assertDeletedHorse({ deletedAt: new Date('2026-01-01') }),
      ).not.toThrow();
    });
  });

  describe('assertLifecycleWritable', () => {
    it('answers 409 for a transferred horse', () => {
      expect(() =>
        assertLifecycleWritable({
          lifecycleStatus: HorseLifecycleStatus.TRANSFERRED,
        }),
      ).toThrow(
        new ConflictException('Ngựa đã chuyển nhượng, hồ sơ chỉ được xem'),
      );
    });

    it('answers 409 for a deceased horse', () => {
      expect(() =>
        assertLifecycleWritable({
          lifecycleStatus: HorseLifecycleStatus.DECEASED,
        }),
      ).toThrow(new ConflictException('Ngựa đã mất, hồ sơ chỉ được xem'));
    });

    it('passes a horse whose profile is writable', () => {
      expect(() =>
        assertLifecycleWritable({
          lifecycleStatus: HorseLifecycleStatus.ACTIVE,
        }),
      ).not.toThrow();
    });
  });

  describe('DECEASED lifecycle', () => {
    it('can be reached from ACTIVE and RETIRED only', () => {
      expect(
        lifecycleTransitionError(
          HorseLifecycleStatus.ACTIVE,
          HorseLifecycleStatus.DECEASED,
        ),
      ).toBeNull();
      expect(
        lifecycleTransitionError(
          HorseLifecycleStatus.RETIRED,
          HorseLifecycleStatus.DECEASED,
        ),
      ).toBeNull();
      expect(
        lifecycleTransitionError(
          HorseLifecycleStatus.TRANSFERRED,
          HorseLifecycleStatus.DECEASED,
        ),
      ).toBe('Không thể chuyển vòng đời từ Đã chuyển nhượng sang Đã mất');
    });

    it('is final', () => {
      for (const to of [
        HorseLifecycleStatus.ACTIVE,
        HorseLifecycleStatus.RETIRED,
        HorseLifecycleStatus.TRANSFERRED,
      ]) {
        expect(
          lifecycleTransitionError(HorseLifecycleStatus.DECEASED, to),
        ).toBe('Ngựa đã mất, hồ sơ chỉ được xem');
      }
    });

    it('cleans up like a transfer without resetting health and keeps the owner', () => {
      expect(
        lifecycleSideEffects(
          HorseLifecycleStatus.ACTIVE,
          HorseLifecycleStatus.DECEASED,
        ),
      ).toEqual({
        ...lifecycleSideEffects(
          HorseLifecycleStatus.ACTIVE,
          HorseLifecycleStatus.TRANSFERRED,
        ),
        endOwnership: false,
      });
      expect(
        lifecycleSideEffects(
          HorseLifecycleStatus.RETIRED,
          HorseLifecycleStatus.DECEASED,
        ),
      ).toEqual({
        ...lifecycleSideEffects(
          HorseLifecycleStatus.RETIRED,
          HorseLifecycleStatus.TRANSFERRED,
        ),
        endOwnership: false,
      });
      expect(
        lifecycleSideEffects(
          HorseLifecycleStatus.ACTIVE,
          HorseLifecycleStatus.DECEASED,
        ).resetHealth,
      ).toBe(false);
    });

    it('is not eligible, not placed and read-only', () => {
      expect(
        evaluateEligibility({
          isDeleted: false,
          lifecycleStatus: HorseLifecycleStatus.DECEASED,
          healthStatus: HorseHealthStatus.ELIGIBLE,
          hasActiveTrainingLock: false,
        }),
      ).toMatchObject({
        trainingEligible: false,
        racingEligible: false,
        reasons: [EligibilityReason.LIFECYCLE_DECEASED],
      });
      expect(
        placementStatusOf(HorseLifecycleStatus.DECEASED, null, null, null),
      ).toBe(HorsePlacementStatus.NOT_APPLICABLE);
      expect(
        barnChangeBlockedReason(HorseLifecycleStatus.DECEASED, null, 'b1'),
      ).toBe('Ngựa đã mất, hồ sơ chỉ đọc');
      const permissions = evaluateHorsePermissions({
        roles: [
          UserRole.CLUB_MANAGER,
          UserRole.VETERINARIAN,
          UserRole.HEAD_TRAINER,
        ],
        isDeleted: false,
        hasBarn: false,
        lifecycleStatus: HorseLifecycleStatus.DECEASED,
        isInTrainerBarn: true,
        isAssignedGroom: false,
      });
      expect(permissions).toMatchObject({
        canEditProfile: false,
        canEditRaceAptitude: false,
        canAssignBarn: false,
        canAssignStallAndGroom: false,
        canChangeLifecycle: false,
        canDelete: false,
        canChangeHealth: false,
        canRecordMeasurement: false,
      });
    });
  });

  describe('assertOwnerAssignment', () => {
    it('lets an owner be assigned to a horse without one, or the same owner be sent again', () => {
      expect(() => assertOwnerAssignment(null, 'o1')).not.toThrow();
      expect(() => assertOwnerAssignment('o1', 'o1')).not.toThrow();
    });

    it('rejects changing the owner of a horse that has one with 409', () => {
      expect(() => assertOwnerAssignment('o1', 'o2')).toThrow(
        new ConflictException(
          'Ngựa đã có chủ sở hữu, đổi chủ bằng chức năng chuyển nhượng nội bộ',
        ),
      );
    });

    it('rejects clearing the owner with 400 on the ownerId field', () => {
      const message =
        'Không bỏ trống chủ sở hữu được, đổi chủ bằng chức năng chuyển nhượng nội bộ';
      expect(() => assertOwnerAssignment('o1', null)).toThrow(
        new BadRequestException(message),
      );
      try {
        assertOwnerAssignment(null, null);
      } catch (error) {
        expect((error as BadRequestException).getResponse()).toEqual({
          message,
          errors: [{ field: 'ownerId', message }],
        });
      }
    });
  });

  describe('microchipTakenMessage', () => {
    const holder = (
      lifecycleStatus: HorseLifecycleStatus,
      deletedAt: Date | null = null,
    ) => ({ name: 'Winx', lifecycleStatus, deletedAt });

    it.each([
      [
        holder(HorseLifecycleStatus.TRANSFERRED),
        true,
        'Số chip trùng với ngựa Winx (Đã chuyển nhượng). Dùng kích hoạt lại thay vì tạo mới',
      ],
      [
        holder(HorseLifecycleStatus.ACTIVE, new Date()),
        true,
        'Số chip trùng với ngựa Winx (hồ sơ đã xóa). Khôi phục hồ sơ đó thay vì tạo mới',
      ],
      [
        holder(HorseLifecycleStatus.DECEASED),
        true,
        'Số chip trùng với ngựa Winx (Đã mất). Kiểm tra lại số chip',
      ],
      [
        holder(HorseLifecycleStatus.TRANSFERRED),
        false,
        'Số chip trùng với ngựa Winx (Đã chuyển nhượng). Kiểm tra lại số chip',
      ],
    ])('names the holder and the way out (%#)', (input, creating, message) => {
      expect(microchipTakenMessage(input, creating)).toBe(message);
    });
  });

  describe('assertLifecycleOwner', () => {
    const effects = (from: HorseLifecycleStatus, to: HorseLifecycleStatus) =>
      lifecycleSideEffects(from, to);

    it('requires an owner only when reactivating a transferred horse', () => {
      expect(() =>
        assertLifecycleOwner(
          effects(
            HorseLifecycleStatus.TRANSFERRED,
            HorseLifecycleStatus.ACTIVE,
          ),
          undefined,
        ),
      ).toThrow(
        new BadRequestException(
          'Kích hoạt lại ngựa đã chuyển nhượng phải chọn chủ sở hữu',
        ),
      );
      expect(() =>
        assertLifecycleOwner(
          effects(
            HorseLifecycleStatus.TRANSFERRED,
            HorseLifecycleStatus.ACTIVE,
          ),
          'owner-1',
        ),
      ).not.toThrow();
    });

    it('refuses an owner for any other change', () => {
      expect(() =>
        assertLifecycleOwner(
          effects(HorseLifecycleStatus.RETIRED, HorseLifecycleStatus.ACTIVE),
          'owner-1',
        ),
      ).toThrow(
        new BadRequestException(
          'Chỉ chọn chủ sở hữu khi kích hoạt lại ngựa đã chuyển nhượng',
        ),
      );
      expect(() =>
        assertLifecycleOwner(
          effects(
            HorseLifecycleStatus.ACTIVE,
            HorseLifecycleStatus.TRANSFERRED,
          ),
          undefined,
        ),
      ).not.toThrow();
    });
  });
});

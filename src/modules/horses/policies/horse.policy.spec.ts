import { UserRole } from '../../../common/enums/role.enum';
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
  UnprocessableEntityException,
} from '@nestjs/common';
import { HorseMeasurementSource } from '../enums/horse-measurement-source.enum';
import {
  assertAbnormalConfirmed,
  assertBornBeforeChildren,
  assertDateOfBirth,
  assertDistinctMeasurementTypes,
  assertGenderKeepsPedigree,
  assertLifecycleTransition,
  assertMeasuredAt,
  assertMeasurementDeletable,
  assertMeasurementValue,
  assertNoBusinessData,
  assertNotParent,
  assertParentIds,
  assertParentProfiles,
  canRecordMeasurement,
  evaluateEligibility,
  evaluateHorsePermissions,
  isHorseInScope,
  lifecycleImpactSummary,
  lifecycleSideEffects,
  lifecycleTransitionError,
  managerForbiddenFields,
  measurementAlerts,
  placementStatusOf,
  trainerForbiddenFields,
} from './horse.policy';

const DAY_MS = 24 * 60 * 60 * 1000;

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
        reasons: [],
      });
    });

    it('blocks both when the profile is deleted', () => {
      expect(evaluateEligibility({ ...eligible, isDeleted: true })).toEqual({
        trainingEligible: false,
        racingEligible: false,
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
        reasons: [reason],
      });
    });

    it('blocks both while a training lock is active', () => {
      expect(
        evaluateEligibility({ ...eligible, hasActiveTrainingLock: true }),
      ).toEqual({
        trainingEligible: false,
        racingEligible: false,
        reasons: [EligibilityReason.ACTIVE_TRAINING_LOCK],
      });
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

    it('turns off every profile write except canChangeLifecycle on a TRANSFERRED horse', () => {
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
        canDeleteMeasurement: false,
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
        placementStatusOf(HorseLifecycleStatus.TRANSFERRED, 'b1', 's1'),
      ).toBe(HorsePlacementStatus.NOT_APPLICABLE);
    });

    it('returns PENDING_BARN without a barn', () => {
      expect(placementStatusOf(HorseLifecycleStatus.ACTIVE, null, null)).toBe(
        HorsePlacementStatus.PENDING_BARN,
      );
    });

    it('returns PENDING_STALL with a barn but no stall', () => {
      expect(placementStatusOf(HorseLifecycleStatus.RETIRED, 'b1', null)).toBe(
        HorsePlacementStatus.PENDING_STALL,
      );
    });

    it('returns PLACED with both barn and stall', () => {
      expect(placementStatusOf(HorseLifecycleStatus.ACTIVE, 'b1', 's1')).toBe(
        HorsePlacementStatus.PLACED,
      );
    });
  });

  describe('lifecycleSideEffects', () => {
    const none = {
      cancelTraining: false,
      withdrawRegistrations: false,
      releaseStall: false,
      endGroom: false,
      clearBarn: false,
      releaseTrainingLock: false,
      resetHealth: false,
      reactivateFromTransfer: false,
    };
    const transferEffects = {
      releaseStall: true,
      endGroom: true,
      clearBarn: true,
      releaseTrainingLock: true,
    };

    it('retires an ACTIVE horse by cancelling training and withdrawing registrations only', () => {
      expect(
        lifecycleSideEffects(
          HorseLifecycleStatus.ACTIVE,
          HorseLifecycleStatus.RETIRED,
        ),
      ).toEqual({
        ...none,
        cancelTraining: true,
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
        cancelTraining: true,
        withdrawRegistrations: true,
      });
    });

    it('transfers a RETIRED horse without cancelling training or withdrawing registrations', () => {
      expect(
        lifecycleSideEffects(
          HorseLifecycleStatus.RETIRED,
          HorseLifecycleStatus.TRANSFERRED,
        ),
      ).toEqual({ ...none, ...transferEffects });
    });

    it('only resets health when reactivating from RETIRED', () => {
      expect(
        lifecycleSideEffects(
          HorseLifecycleStatus.RETIRED,
          HorseLifecycleStatus.ACTIVE,
        ),
      ).toEqual({ ...none, resetHealth: true });
    });

    it('resets health and marks the reactivation from a transfer', () => {
      expect(
        lifecycleSideEffects(
          HorseLifecycleStatus.TRANSFERRED,
          HorseLifecycleStatus.ACTIVE,
        ),
      ).toEqual({ ...none, resetHealth: true, reactivateFromTransfer: true });
    });
  });

  describe('managerForbiddenFields / trainerForbiddenFields', () => {
    it('forbids raceAptitude for the manager and ignores undefined values', () => {
      expect(
        managerForbiddenFields({
          name: 'Gió',
          raceAptitude: 'SPRINTER',
          color: undefined,
        }),
      ).toEqual(['raceAptitude']);
      expect(
        managerForbiddenFields({ name: 'Gió', raceAptitude: undefined }),
      ).toEqual([]);
    });

    it('forbids every field except raceAptitude for the trainer', () => {
      expect(
        trainerForbiddenFields({
          raceAptitude: 'MILER',
          name: 'Gió',
          ownerId: null,
          color: undefined,
        }),
      ).toEqual(['name', 'ownerId']);
      expect(trainerForbiddenFields({ raceAptitude: 'MILER' })).toEqual([]);
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
        new BadRequestException('Sire và dam không được trùng nhau'),
      );
    });
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
      ).toThrow(new BadRequestException('Sire phải là ngựa đực'));
    });

    it('rejects a non-female dam', () => {
      expect(() =>
        assertParentProfiles(child, null, {
          ...mare,
          gender: HorseGender.MALE,
        }),
      ).toThrow(new BadRequestException('Dam phải là ngựa cái'));
    });

    it('rejects a parent born on or after the child', () => {
      expect(() =>
        assertParentProfiles(
          child,
          { ...stallion, dateOfBirth: '2022-01-01' },
          null,
        ),
      ).toThrow(new BadRequestException('Cha/mẹ phải sinh trước ngựa con'));
    });

    it('skips the birth-date check when a date is missing', () => {
      expect(() =>
        assertParentProfiles({ dateOfBirth: null }, stallion, mare),
      ).not.toThrow();
    });
  });

  describe('assertDateOfBirth', () => {
    it('accepts today, the past and a missing date', () => {
      expect(() => assertDateOfBirth('2026-09-23', '2026-09-23')).not.toThrow();
      expect(() => assertDateOfBirth('2020-01-01', '2026-09-23')).not.toThrow();
      expect(() => assertDateOfBirth(null, '2026-09-23')).not.toThrow();
      expect(() => assertDateOfBirth(undefined, '2026-09-23')).not.toThrow();
    });

    it('rejects a date after today with 400', () => {
      expect(() => assertDateOfBirth('2026-09-24', '2026-09-23')).toThrow(
        new BadRequestException('Ngày sinh không được ở tương lai'),
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

    it('rejects a date on or after the earliest child with 400', () => {
      expect(() =>
        assertBornBeforeChildren('2020-01-01', '2020-01-01'),
      ).toThrow(new BadRequestException('Cha/mẹ phải sinh trước ngựa con'));
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
        'Không thể chuyển vòng đời từ TRANSFERRED sang RETIRED',
      );
      expect(() => assertLifecycleTransition(from, to)).toThrow(
        ConflictException,
      );
    });
  });

  describe('lifecycleImpactSummary', () => {
    const impact = {
      openTrainingPlans: 2,
      openRaceRegistrations: 1,
      stallCode: 'A-01',
      groomName: 'Lan',
      barnName: 'Khu A',
      hasActiveTrainingLock: true,
      invalidOwnerName: null,
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
        'Winx đang có 2 giáo án huấn luyện đang mở, 1 đăng ký thi đấu chưa diễn ra. Nếu giải nghệ sẽ hủy giáo án, rút khỏi giải.',
      );
    });

    it('only states the action when nothing is affected', () => {
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
      ).toBe(
        'Nếu kích hoạt lại sẽ đặt sức khỏe về Cần theo dõi tới khi bác sĩ khám lại.',
      );
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

  describe('assertMeasuredAt', () => {
    const now = new Date('2026-09-23T10:00:00Z');

    it('accepts now and a small clock skew', () => {
      expect(() => assertMeasuredAt(now, now)).not.toThrow();
      expect(() =>
        assertMeasuredAt(new Date(now.getTime() + 30_000), now),
      ).not.toThrow();
    });

    it('rejects a time beyond the clock skew in the future', () => {
      expect(() =>
        assertMeasuredAt(new Date(now.getTime() + 120_000), now),
      ).toThrow(new BadRequestException('Thời điểm đo không được ở tương lai'));
    });

    it('accepts exactly 7 days back and rejects older', () => {
      expect(() =>
        assertMeasuredAt(new Date(now.getTime() - 7 * DAY_MS), now),
      ).not.toThrow();
      expect(() =>
        assertMeasuredAt(new Date(now.getTime() - 7 * DAY_MS - 1), now),
      ).toThrow(new BadRequestException('Chỉ được nhập lùi tối đa 7 ngày'));
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
});

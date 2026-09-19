import { UserRole } from '../../../common/enums/role.enum';
import { EligibilityReason } from '../constants/eligibility-reason.enum';
import { HorseGender } from '../constants/horse-gender.enum';
import { HorseMeasurementAlert } from '../constants/horse-measurement-alert.enum';
import { HorseMeasurementType } from '../constants/horse-measurement-type.enum';
import {
  HorseHealthStatus,
  HorseLifecycleStatus,
} from '../constants/horse-status.enum';
import {
  activationError,
  canTransitionLifecycle,
  childBirthDateError,
  dateOfBirthError,
  evaluateEligibility,
  evaluateHorsePermissions,
  futureTransferError,
  isAbnormalMeasurement,
  lifecycleSideEffects,
  measuredAtError,
  measurementAlerts,
  measurementValueError,
  ownerSharesError,
  parentIdError,
  parentProfileError,
  planOwnershipChange,
  recordableMeasurementTypes,
  staleTransferError,
  trainerForbiddenFields,
} from './horse.policy';

describe('horse rules', () => {
  describe('parentIdError', () => {
    it('rejects a horse as its own parent', () => {
      expect(parentIdError('h1', 'h1', null)).not.toBeNull();
    });

    it('rejects identical sire and dam', () => {
      expect(parentIdError(undefined, 'p1', 'p1')).not.toBeNull();
    });

    it('accepts distinct parents', () => {
      expect(parentIdError('h1', 'p1', 'p2')).toBeNull();
    });
  });

  describe('dateOfBirthError', () => {
    it('rejects a date after today', () => {
      expect(dateOfBirthError('2026-09-20', '2026-09-19')).not.toBeNull();
    });

    it('accepts today', () => {
      expect(dateOfBirthError('2026-09-19', '2026-09-19')).toBeNull();
    });

    it('accepts a missing date', () => {
      expect(dateOfBirthError(null, '2026-09-19')).toBeNull();
    });
  });

  describe('childBirthDateError', () => {
    it('rejects a parent born on or after its earliest child', () => {
      expect(childBirthDateError('2020-05-01', '2020-05-01')).not.toBeNull();
      expect(childBirthDateError('2021-01-01', '2020-05-01')).not.toBeNull();
    });

    it('accepts a parent born before its earliest child', () => {
      expect(childBirthDateError('2015-03-10', '2020-05-01')).toBeNull();
    });

    it('accepts a missing date on either side', () => {
      expect(childBirthDateError(null, '2020-05-01')).toBeNull();
      expect(childBirthDateError('2021-01-01', null)).toBeNull();
    });
  });

  describe('parentProfileError', () => {
    const stallion = {
      id: 's',
      gender: HorseGender.MALE,
      dateOfBirth: '2010-01-01',
    };
    const mare = {
      id: 'd',
      gender: HorseGender.FEMALE,
      dateOfBirth: '2012-01-01',
    };

    it('accepts a valid pair', () => {
      expect(
        parentProfileError({ dateOfBirth: '2020-03-01' }, stallion, mare),
      ).toBeNull();
    });

    it('rejects a female sire', () => {
      expect(parentProfileError({}, mare, null)).toBe('Sire phải là ngựa đực');
    });

    it('rejects a sire with no gender on record', () => {
      expect(parentProfileError({}, { ...stallion, gender: null }, null)).toBe(
        'Sire phải là ngựa đực',
      );
    });

    it('accepts a gelding sire', () => {
      expect(
        parentProfileError(
          {},
          { ...stallion, gender: HorseGender.GELDING },
          null,
        ),
      ).toBeNull();
    });

    it('rejects a non-female dam', () => {
      expect(parentProfileError({}, null, stallion)).toBe(
        'Dam phải là ngựa cái',
      );
    });

    it('rejects a parent born after the child', () => {
      expect(
        parentProfileError({ dateOfBirth: '2011-01-01' }, stallion, mare),
      ).toBe('Cha/mẹ phải sinh trước ngựa con');
    });
  });

  describe('activationError', () => {
    it('accepts a reference horse', () => {
      expect(activationError(true)).toBeNull();
    });

    it('rejects a horse that already belongs to the club', () => {
      expect(activationError(false)).toBe(
        'Ngựa đã thuộc câu lạc bộ, không cần kích hoạt',
      );
    });
  });

  describe('canTransitionLifecycle', () => {
    it('allows ACTIVE to RETIRED and back', () => {
      expect(
        canTransitionLifecycle(
          HorseLifecycleStatus.ACTIVE,
          HorseLifecycleStatus.RETIRED,
        ),
      ).toBe(true);
      expect(
        canTransitionLifecycle(
          HorseLifecycleStatus.RETIRED,
          HorseLifecycleStatus.ACTIVE,
        ),
      ).toBe(true);
    });

    it('allows a TRANSFERRED horse to come back as ACTIVE', () => {
      expect(
        canTransitionLifecycle(
          HorseLifecycleStatus.TRANSFERRED,
          HorseLifecycleStatus.ACTIVE,
        ),
      ).toBe(true);
    });

    it('does not allow TRANSFERRED to RETIRED directly', () => {
      expect(
        canTransitionLifecycle(
          HorseLifecycleStatus.TRANSFERRED,
          HorseLifecycleStatus.RETIRED,
        ),
      ).toBe(false);
    });

    it('allows a RETIRED horse to be transferred', () => {
      expect(
        canTransitionLifecycle(
          HorseLifecycleStatus.RETIRED,
          HorseLifecycleStatus.TRANSFERRED,
        ),
      ).toBe(true);
    });
  });

  describe('lifecycleSideEffects', () => {
    it('cancels training and withdraws registrations but keeps the stall when retiring', () => {
      expect(lifecycleSideEffects(HorseLifecycleStatus.RETIRED)).toEqual({
        cancelTraining: true,
        withdrawRegistrations: true,
        closeStallOwnershipGroom: false,
        releaseTrainingLock: false,
      });
    });

    it('also closes stall, ownership, groom and releases the lock when transferring', () => {
      expect(lifecycleSideEffects(HorseLifecycleStatus.TRANSFERRED)).toEqual({
        cancelTraining: true,
        withdrawRegistrations: true,
        closeStallOwnershipGroom: true,
        releaseTrainingLock: true,
      });
    });

    it('does nothing when coming back to ACTIVE', () => {
      expect(lifecycleSideEffects(HorseLifecycleStatus.ACTIVE)).toEqual({
        cancelTraining: false,
        withdrawRegistrations: false,
        closeStallOwnershipGroom: false,
        releaseTrainingLock: false,
      });
    });
  });

  describe('ownerSharesError', () => {
    it('accepts shares summing to 100', () => {
      expect(
        ownerSharesError([
          { ownerId: 'a', percentage: 33.33 },
          { ownerId: 'b', percentage: 33.33 },
          { ownerId: 'c', percentage: 33.34 },
        ]),
      ).toBeNull();
    });

    it('rejects duplicate owners', () => {
      expect(
        ownerSharesError([
          { ownerId: 'a', percentage: 50 },
          { ownerId: 'a', percentage: 50 },
        ]),
      ).not.toBeNull();
    });

    it('accepts shares without a representative', () => {
      expect(
        ownerSharesError([
          { ownerId: 'a', percentage: 50 },
          { ownerId: 'b', percentage: 50 },
        ]),
      ).toBeNull();
    });

    it('accepts one representative', () => {
      expect(
        ownerSharesError([
          { ownerId: 'a', percentage: 50, isRepresentative: true },
          { ownerId: 'b', percentage: 50 },
        ]),
      ).toBeNull();
    });

    it('rejects more than one representative', () => {
      expect(
        ownerSharesError([
          { ownerId: 'a', percentage: 50, isRepresentative: true },
          { ownerId: 'b', percentage: 50, isRepresentative: true },
        ]),
      ).toBe('Chỉ được chọn tối đa một chủ đại diện');
    });

    it('rejects totals other than 100', () => {
      expect(ownerSharesError([{ ownerId: 'a', percentage: 90 }])).toBe(
        'Tổng tỷ lệ sở hữu phải bằng 100',
      );
    });
  });

  describe('futureTransferError', () => {
    const now = new Date('2026-09-20T10:00:00+07:00');

    it('accepts a transfer at the current moment or earlier', () => {
      expect(futureTransferError(now, now)).toBeNull();
      expect(
        futureTransferError(new Date('2026-09-19T10:00:00+07:00'), now),
      ).toBeNull();
    });

    it('rejects a transfer in the future', () => {
      expect(
        futureTransferError(new Date('2026-09-20T10:00:01+07:00'), now),
      ).not.toBeNull();
    });
  });

  describe('staleTransferError', () => {
    const latest = new Date('2026-09-10T14:30:00+07:00');

    it('accepts any moment when the horse has no open ownership', () => {
      expect(
        staleTransferError(new Date('2000-01-01T00:00:00Z'), null),
      ).toBeNull();
    });

    it('accepts a transfer after the latest open ownership started', () => {
      expect(
        staleTransferError(new Date('2026-09-10T14:31:00+07:00'), latest),
      ).toBeNull();
    });

    it('rejects a transfer at or before the latest open ownership start', () => {
      expect(staleTransferError(latest, latest)).not.toBeNull();
      expect(
        staleTransferError(new Date('2026-09-09T00:00:00+07:00'), latest),
      ).not.toBeNull();
    });
  });

  describe('planOwnershipChange', () => {
    const openA = {
      id: 'row-a',
      ownerId: 'a',
      percentage: '60.00',
      isRepresentative: true,
    };
    const openB = {
      id: 'row-b',
      ownerId: 'b',
      percentage: '40.00',
      isRepresentative: false,
    };

    it('keeps an unchanged owner and only replaces the changed share', () => {
      expect(
        planOwnershipChange(
          [openA, openB],
          [
            { ownerId: 'a', percentage: 40, isRepresentative: true },
            { ownerId: 'b', percentage: 40 },
            { ownerId: 'c', percentage: 20 },
          ],
        ),
      ).toEqual({
        closeIds: ['row-a'],
        inserts: [
          { ownerId: 'a', percentage: 40, isRepresentative: true },
          { ownerId: 'c', percentage: 20 },
        ],
      });
    });

    it('closes an owner who is dropped', () => {
      expect(
        planOwnershipChange(
          [openA, openB],
          [
            { ownerId: 'a', percentage: 60, isRepresentative: true },
            { ownerId: 'c', percentage: 40 },
          ],
        ),
      ).toEqual({
        closeIds: ['row-b'],
        inserts: [{ ownerId: 'c', percentage: 40 }],
      });
    });

    it('replaces the rows whose representative flag changes', () => {
      expect(
        planOwnershipChange(
          [openA, openB],
          [
            { ownerId: 'a', percentage: 60 },
            { ownerId: 'b', percentage: 40, isRepresentative: true },
          ],
        ),
      ).toEqual({
        closeIds: ['row-a', 'row-b'],
        inserts: [
          { ownerId: 'a', percentage: 60 },
          { ownerId: 'b', percentage: 40, isRepresentative: true },
        ],
      });
    });

    it('changes nothing when the shares are the same', () => {
      expect(
        planOwnershipChange(
          [openA, openB],
          [
            { ownerId: 'a', percentage: 60, isRepresentative: true },
            { ownerId: 'b', percentage: 40, isRepresentative: false },
          ],
        ),
      ).toEqual({ closeIds: [], inserts: [] });
    });

    it('inserts every share when the horse has no open ownership', () => {
      const shares = [{ ownerId: 'a', percentage: 100 }];
      expect(planOwnershipChange([], shares)).toEqual({
        closeIds: [],
        inserts: shares,
      });
    });
  });

  describe('evaluateEligibility', () => {
    const base = {
      isReference: false,
      lifecycleStatus: HorseLifecycleStatus.ACTIVE,
      healthStatus: HorseHealthStatus.ELIGIBLE,
      hasActiveTrainingLock: false,
    };

    it('is fully eligible when active, healthy and unlocked', () => {
      expect(evaluateEligibility(base)).toEqual({
        trainingEligible: true,
        racingEligible: true,
        reasons: [],
      });
    });

    it('allows training but not racing under observation', () => {
      const result = evaluateEligibility({
        ...base,
        healthStatus: HorseHealthStatus.UNDER_OBSERVATION,
      });
      expect(result.trainingEligible).toBe(true);
      expect(result.racingEligible).toBe(false);
    });

    it('blocks everything under an active training lock', () => {
      const result = evaluateEligibility({
        ...base,
        hasActiveTrainingLock: true,
      });
      expect(result.trainingEligible).toBe(false);
      expect(result.racingEligible).toBe(false);
      expect(result.reasons).toContain(EligibilityReason.ACTIVE_TRAINING_LOCK);
    });

    it('never makes a reference horse eligible', () => {
      expect(
        evaluateEligibility({ ...base, isReference: true }).reasons,
      ).toEqual([EligibilityReason.REFERENCE_HORSE]);
    });
  });

  describe('measurementValueError', () => {
    it('accepts values inside the range of each type', () => {
      expect(
        measurementValueError(HorseMeasurementType.WEIGHT, 512.5),
      ).toBeNull();
      expect(
        measurementValueError(HorseMeasurementType.TEMPERATURE, 37.8),
      ).toBeNull();
    });

    it('rejects values outside the range of the type', () => {
      expect(
        measurementValueError(HorseMeasurementType.WEIGHT, 2000),
      ).not.toBeNull();
      expect(
        measurementValueError(HorseMeasurementType.BODY_CONDITION, 10),
      ).not.toBeNull();
      expect(
        measurementValueError(HorseMeasurementType.TEMPERATURE, 512.5),
      ).not.toBeNull();
    });
  });
});

describe('isAbnormalMeasurement', () => {
  it('keeps the normal range bounds as normal', () => {
    expect(isAbnormalMeasurement(HorseMeasurementType.WEIGHT, 400)).toBe(false);
    expect(isAbnormalMeasurement(HorseMeasurementType.WEIGHT, 600)).toBe(false);
    expect(isAbnormalMeasurement(HorseMeasurementType.TEMPERATURE, 38.3)).toBe(
      false,
    );
  });

  it('flags values outside the normal range', () => {
    expect(isAbnormalMeasurement(HorseMeasurementType.WEIGHT, 399.99)).toBe(
      true,
    );
    expect(isAbnormalMeasurement(HorseMeasurementType.HEIGHT, 176)).toBe(true);
    expect(isAbnormalMeasurement(HorseMeasurementType.BODY_CONDITION, 3)).toBe(
      true,
    );
    expect(isAbnormalMeasurement(HorseMeasurementType.TEMPERATURE, 37.1)).toBe(
      true,
    );
  });
});

describe('measurementAlerts', () => {
  const { WEIGHT, TEMPERATURE } = HorseMeasurementType;

  it('raises a fever alert only above 38.6', () => {
    expect(measurementAlerts(TEMPERATURE, 38.6, null)).toEqual([]);
    expect(measurementAlerts(TEMPERATURE, 38.61, null)).toMatchObject([
      { alert: HorseMeasurementAlert.FEVER },
    ]);
  });

  it('raises a weight drop alert only above 5%', () => {
    expect(measurementAlerts(WEIGHT, 475, 500)).toEqual([]);
    expect(measurementAlerts(WEIGHT, 474.9, 500)).toMatchObject([
      {
        alert: HorseMeasurementAlert.WEIGHT_DROP,
        baselineValue: 500,
        dropPercent: 5.02,
      },
    ]);
  });

  it('skips the weight check without a baseline', () => {
    expect(measurementAlerts(WEIGHT, 300, null)).toEqual([]);
  });
});

describe('recordableMeasurementTypes', () => {
  const scope = { isInTrainerBarn: true, isAssignedGroom: true };
  const { WEIGHT, HEIGHT, BODY_CONDITION, TEMPERATURE } = HorseMeasurementType;

  it('gives each role only the types of F1.7', () => {
    expect(
      recordableMeasurementTypes({ ...scope, roles: [UserRole.HEAD_TRAINER] }),
    ).toEqual([WEIGHT, BODY_CONDITION]);
    expect(
      recordableMeasurementTypes({ ...scope, roles: [UserRole.GROOM] }),
    ).toEqual([WEIGHT, TEMPERATURE]);
    expect(
      recordableMeasurementTypes({ ...scope, roles: [UserRole.VETERINARIAN] }),
    ).toEqual([WEIGHT, HEIGHT, BODY_CONDITION, TEMPERATURE]);
  });

  it('gives nothing to a club manager or a horse owner', () => {
    expect(
      recordableMeasurementTypes({
        ...scope,
        roles: [UserRole.CLUB_MANAGER, UserRole.HORSE_OWNER],
      }),
    ).toEqual([]);
  });

  it('drops a head trainer outside their barn and an unassigned groom', () => {
    expect(
      recordableMeasurementTypes({
        isInTrainerBarn: false,
        isAssignedGroom: false,
        roles: [UserRole.HEAD_TRAINER, UserRole.GROOM],
      }),
    ).toEqual([]);
  });

  it('unions the types of every role in scope', () => {
    expect(
      recordableMeasurementTypes({
        isInTrainerBarn: true,
        isAssignedGroom: false,
        roles: [UserRole.HEAD_TRAINER, UserRole.GROOM],
      }),
    ).toEqual([WEIGHT, BODY_CONDITION]);
    expect(
      recordableMeasurementTypes({
        ...scope,
        roles: [UserRole.HEAD_TRAINER, UserRole.GROOM],
      }),
    ).toEqual([WEIGHT, BODY_CONDITION, TEMPERATURE]);
  });
});

describe('measuredAtError', () => {
  const now = new Date('2026-09-20T10:00:00Z');
  const daysAgo = (days: number, extraMs = 0) =>
    new Date(now.getTime() - days * 24 * 60 * 60 * 1000 - extraMs);

  it('accepts now and exactly 7 days back', () => {
    expect(measuredAtError(now, now)).toBeNull();
    expect(measuredAtError(daysAgo(7), now)).toBeNull();
  });

  it('rejects a time more than 7 days back', () => {
    expect(measuredAtError(daysAgo(7, 1), now)).toBe(
      'Chỉ được nhập lùi tối đa 7 ngày',
    );
  });

  it('rejects a future time beyond the clock skew', () => {
    expect(measuredAtError(new Date(now.getTime() + 30_000), now)).toBeNull();
    expect(measuredAtError(new Date(now.getTime() + 120_000), now)).toBe(
      'Thời điểm đo không được ở tương lai',
    );
  });
});

describe('evaluateHorsePermissions', () => {
  const base = {
    isReference: false,
    isDeleted: false,
    lifecycleStatus: HorseLifecycleStatus.ACTIVE,
    isInTrainerBarn: false,
    isAssignedGroom: false,
  };
  const forRole = (role: UserRole, patch: Partial<typeof base> = {}) =>
    evaluateHorsePermissions({ ...base, ...patch, roles: [role] });

  it('lets a club manager manage the profile and see every tab', () => {
    expect(forRole(UserRole.CLUB_MANAGER)).toEqual({
      canEdit: true,
      canEditRaceAptitude: true,
      canChangeLifecycle: true,
      canManageOwners: true,
      canChangeHealth: false,
      canRecordMeasurement: false,
      recordableMeasurementTypes: [],
      canViewPedigree: true,
      canViewOwners: true,
      canViewMeasurementHistory: true,
      canViewMedicalRecords: true,
      canViewTrainingEvaluation: true,
      canViewPerformance: true,
      canViewPerformanceDetail: true,
      canOpenReferenceHorses: true,
      canActivateReference: false,
    });
  });

  it('lets only a club manager activate a live reference horse', () => {
    expect(
      forRole(UserRole.CLUB_MANAGER, { isReference: true })
        .canActivateReference,
    ).toBe(true);
    expect(
      forRole(UserRole.CLUB_MANAGER, { isReference: true, isDeleted: true })
        .canActivateReference,
    ).toBe(false);
    expect(
      forRole(UserRole.HEAD_TRAINER, { isReference: true })
        .canActivateReference,
    ).toBe(false);
  });

  it('lets a head trainer open medical records only inside their barn', () => {
    expect(forRole(UserRole.HEAD_TRAINER).canViewMedicalRecords).toBe(false);
    expect(
      forRole(UserRole.HEAD_TRAINER, { isInTrainerBarn: true })
        .canViewMedicalRecords,
    ).toBe(true);
  });

  it('shows session scores to a head trainer only inside their barn', () => {
    expect(forRole(UserRole.HEAD_TRAINER).canViewTrainingEvaluation).toBe(
      false,
    );
    expect(
      forRole(UserRole.HEAD_TRAINER, { isInTrainerBarn: true })
        .canViewTrainingEvaluation,
    ).toBe(true);
  });

  it('hides session scores from a groom', () => {
    expect(
      forRole(UserRole.GROOM, { isAssignedGroom: true })
        .canViewTrainingEvaluation,
    ).toBe(false);
  });

  it('keeps a groom out of both performance views', () => {
    const permissions = forRole(UserRole.GROOM, { isAssignedGroom: true });
    expect(permissions.canViewPerformance).toBe(false);
    expect(permissions.canViewPerformanceDetail).toBe(false);
  });

  it('shows raw metric points to a veterinarian', () => {
    expect(forRole(UserRole.VETERINARIAN).canViewPerformanceDetail).toBe(true);
  });

  it('keeps a groom out of the medical records tab', () => {
    expect(
      forRole(UserRole.GROOM, { isAssignedGroom: true }).canViewMedicalRecords,
    ).toBe(false);
  });

  it('lets a head trainer record measurements only inside their barn', () => {
    expect(forRole(UserRole.HEAD_TRAINER).canRecordMeasurement).toBe(false);
    expect(
      forRole(UserRole.HEAD_TRAINER, { isInTrainerBarn: true })
        .canRecordMeasurement,
    ).toBe(true);
  });

  it('lets a veterinarian change health and record measurements on any horse', () => {
    const permissions = forRole(UserRole.VETERINARIAN);
    expect(permissions.canChangeHealth).toBe(true);
    expect(permissions.canRecordMeasurement).toBe(true);
    expect(permissions.canViewOwners).toBe(false);
  });

  it('lists the recordable measurement types for the form, empty on a transferred horse', () => {
    expect(
      forRole(UserRole.GROOM, { isAssignedGroom: true })
        .recordableMeasurementTypes,
    ).toEqual([HorseMeasurementType.WEIGHT, HorseMeasurementType.TEMPERATURE]);
    expect(
      forRole(UserRole.VETERINARIAN, {
        lifecycleStatus: HorseLifecycleStatus.TRANSFERRED,
      }).recordableMeasurementTypes,
    ).toEqual([]);
  });

  it('lets a groom record measurements only on an assigned horse', () => {
    expect(forRole(UserRole.GROOM).canRecordMeasurement).toBe(false);
    expect(
      forRole(UserRole.GROOM, { isAssignedGroom: true }).canRecordMeasurement,
    ).toBe(true);
  });

  it('hides the pedigree and owners tabs from a groom', () => {
    const permissions = forRole(UserRole.GROOM, { isAssignedGroom: true });
    expect(permissions.canViewPedigree).toBe(false);
    expect(permissions.canViewOwners).toBe(false);
  });

  it('shows the measurement history tab to a groom', () => {
    expect(forRole(UserRole.GROOM).canViewMeasurementHistory).toBe(true);
  });

  it('gives a horse owner read-only tabs', () => {
    expect(forRole(UserRole.HORSE_OWNER)).toEqual({
      canEdit: false,
      canEditRaceAptitude: false,
      canChangeLifecycle: false,
      canManageOwners: false,
      canChangeHealth: false,
      canRecordMeasurement: false,
      recordableMeasurementTypes: [],
      canViewPedigree: true,
      canViewOwners: true,
      canViewMeasurementHistory: true,
      canViewMedicalRecords: true,
      canViewTrainingEvaluation: true,
      canViewPerformance: true,
      canViewPerformanceDetail: false,
      canOpenReferenceHorses: false,
      canActivateReference: false,
    });
  });

  it('turns off every write on a deleted profile', () => {
    const manager = forRole(UserRole.CLUB_MANAGER, { isDeleted: true });
    const vet = forRole(UserRole.VETERINARIAN, { isDeleted: true });
    expect(manager.canEdit).toBe(false);
    expect(manager.canChangeLifecycle).toBe(false);
    expect(manager.canManageOwners).toBe(false);
    expect(vet.canChangeHealth).toBe(false);
    expect(vet.canRecordMeasurement).toBe(false);
  });

  it('only lets a club manager edit a reference horse', () => {
    const manager = forRole(UserRole.CLUB_MANAGER, { isReference: true });
    expect(manager.canEdit).toBe(true);
    expect(manager.canChangeLifecycle).toBe(false);
    expect(manager.canManageOwners).toBe(false);
    expect(
      forRole(UserRole.VETERINARIAN, { isReference: true }).canChangeHealth,
    ).toBe(false);
  });

  it('keeps a transferred horse read-only except for its lifecycle', () => {
    const transferred = { lifecycleStatus: HorseLifecycleStatus.TRANSFERRED };
    const manager = forRole(UserRole.CLUB_MANAGER, transferred);
    expect(manager.canEdit).toBe(false);
    expect(manager.canManageOwners).toBe(false);
    expect(manager.canChangeLifecycle).toBe(true);
    expect(
      forRole(UserRole.VETERINARIAN, transferred).canRecordMeasurement,
    ).toBe(false);
  });

  it('lets a head trainer edit only the race aptitude, only inside their barn', () => {
    const outside = forRole(UserRole.HEAD_TRAINER);
    const inside = forRole(UserRole.HEAD_TRAINER, { isInTrainerBarn: true });
    expect(outside.canEditRaceAptitude).toBe(false);
    expect(inside.canEditRaceAptitude).toBe(true);
    expect(inside.canEdit).toBe(false);
  });

  it('turns off race aptitude edits on a transferred or deleted horse', () => {
    const inBarn = { isInTrainerBarn: true };
    for (const patch of [
      { lifecycleStatus: HorseLifecycleStatus.TRANSFERRED },
      { isDeleted: true },
    ]) {
      expect(forRole(UserRole.CLUB_MANAGER, patch).canEditRaceAptitude).toBe(
        false,
      );
      expect(
        forRole(UserRole.HEAD_TRAINER, { ...inBarn, ...patch })
          .canEditRaceAptitude,
      ).toBe(false);
    }
  });
});

describe('trainerForbiddenFields', () => {
  it('allows only the race aptitude', () => {
    expect(trainerForbiddenFields({ raceAptitude: null })).toEqual([]);
  });

  it('lists every other field that is sent', () => {
    expect(
      trainerForbiddenFields({
        raceAptitude: null,
        name: 'Gió Nam',
        breed: null,
        color: undefined,
      }),
    ).toEqual(['name', 'breed']);
  });
});

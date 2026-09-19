import { HorseGender } from '../constants/horse-gender.enum';
import { HorseMeasurementType } from '../constants/horse-measurement-type.enum';
import {
  HorseHealthStatus,
  HorseLifecycleStatus,
} from '../constants/horse-status.enum';
import {
  EligibilityReason,
  canTransitionLifecycle,
  evaluateEligibility,
  measurementValueError,
  ownerSharesError,
  parentIdError,
  parentProfileError,
} from './horse.rules';

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

    it('treats TRANSFERRED as final', () => {
      expect(
        canTransitionLifecycle(
          HorseLifecycleStatus.TRANSFERRED,
          HorseLifecycleStatus.ACTIVE,
        ),
      ).toBe(false);
    });

    it('does not allow RETIRED to TRANSFERRED directly', () => {
      expect(
        canTransitionLifecycle(
          HorseLifecycleStatus.RETIRED,
          HorseLifecycleStatus.TRANSFERRED,
        ),
      ).toBe(false);
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

    it('rejects totals other than 100', () => {
      expect(ownerSharesError([{ ownerId: 'a', percentage: 90 }])).toBe(
        'Tổng tỷ lệ sở hữu phải bằng 100',
      );
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

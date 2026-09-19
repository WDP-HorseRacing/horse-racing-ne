import { HorseGender } from '../constants/horse-gender.enum';
import {
  HORSE_MEASUREMENT_SPECS,
  HorseMeasurementType,
} from '../constants/horse-measurement-type.enum';
import {
  HorseHealthStatus,
  HorseLifecycleStatus,
} from '../constants/horse-status.enum';

/**
 * The horse fields needed to validate a sire or dam
 */
export interface ParentCandidate {
  id: string;
  gender: HorseGender | null;
  dateOfBirth: string | null;
}

/**
 * The child horse fields needed to validate its parents
 */
export interface ChildProfile {
  id?: string;
  dateOfBirth?: string | null;
}

/**
 * The reasons a horse is not fully eligible for training or racing
 */
export enum EligibilityReason {
  REFERENCE_HORSE = 'REFERENCE_HORSE',
  LIFECYCLE_NOT_ACTIVE = 'LIFECYCLE_NOT_ACTIVE',
  HEALTH_UNDER_OBSERVATION = 'HEALTH_UNDER_OBSERVATION',
  HEALTH_INJURED = 'HEALTH_INJURED',
  HEALTH_QUARANTINED = 'HEALTH_QUARANTINED',
  ACTIVE_TRAINING_LOCK = 'ACTIVE_TRAINING_LOCK',
}

/**
 * The horse state needed to evaluate training and racing eligibility
 */
export interface EligibilityInput {
  isReference: boolean;
  lifecycleStatus: HorseLifecycleStatus;
  healthStatus: HorseHealthStatus;
  hasActiveTrainingLock: boolean;
}

/**
 * The training and racing eligibility of a horse with the blocking reasons
 */
export interface EligibilityResult {
  trainingEligible: boolean;
  racingEligible: boolean;
  reasons: EligibilityReason[];
}

/**
 * The allowed lifecycle transitions from each status; TRANSFERRED is terminal
 */
const LIFECYCLE_TRANSITIONS: Record<
  HorseLifecycleStatus,
  HorseLifecycleStatus[]
> = {
  [HorseLifecycleStatus.ACTIVE]: [
    HorseLifecycleStatus.RETIRED,
    HorseLifecycleStatus.TRANSFERRED,
  ],
  [HorseLifecycleStatus.RETIRED]: [HorseLifecycleStatus.ACTIVE],
  [HorseLifecycleStatus.TRANSFERRED]: [],
};

/**
 * The eligibility reason for each non-eligible health status
 */
const HEALTH_REASONS: Partial<Record<HorseHealthStatus, EligibilityReason>> = {
  [HorseHealthStatus.UNDER_OBSERVATION]:
    EligibilityReason.HEALTH_UNDER_OBSERVATION,
  [HorseHealthStatus.INJURED]: EligibilityReason.HEALTH_INJURED,
  [HorseHealthStatus.QUARANTINED]: EligibilityReason.HEALTH_QUARANTINED,
};

/**
 * Check the sire and dam IDs against the child and each other
 * @param childId The ID of the child horse, undefined when creating a new horse
 * @param sireId The ID of the sire
 * @param damId The ID of the dam
 * @returns The error message if a parent is the child itself or the parents are the same, or null otherwise
 */
export function parentIdError(
  childId: string | undefined,
  sireId: string | null,
  damId: string | null,
): string | null {
  if (childId && (sireId === childId || damId === childId)) {
    return 'Ngựa không thể là cha/mẹ của chính nó';
  }
  if (sireId && damId && sireId === damId) {
    return 'Sire và dam không được trùng nhau';
  }
  return null;
}

/**
 * Check the gender and date of birth of the sire and dam against the child
 * @param child The child horse profile
 * @param sire The sire, or null if not set
 * @param dam The dam, or null if not set
 * @returns The error message if the sire is female, the dam is not female, or a parent is not born before the child, or null otherwise
 */
export function parentProfileError(
  child: ChildProfile,
  sire: ParentCandidate | null,
  dam: ParentCandidate | null,
): string | null {
  if (sire && sire.gender === HorseGender.FEMALE) {
    return 'Sire phải là ngựa đực';
  }
  if (dam && dam.gender !== HorseGender.FEMALE) {
    return 'Dam phải là ngựa cái';
  }
  for (const parent of [sire, dam]) {
    if (
      parent?.dateOfBirth &&
      child.dateOfBirth &&
      parent.dateOfBirth >= child.dateOfBirth
    ) {
      return 'Cha/mẹ phải sinh trước ngựa con';
    }
  }
  return null;
}

/**
 * Check whether a horse can move from one lifecycle status to another
 * @param from The current lifecycle status
 * @param to The target lifecycle status
 * @returns True if the transition is allowed
 */
export function canTransitionLifecycle(
  from: HorseLifecycleStatus,
  to: HorseLifecycleStatus,
): boolean {
  return LIFECYCLE_TRANSITIONS[from].includes(to);
}

/**
 * Validate the ownership shares of a horse
 * @param shares The owners with their ownership percentages
 * @returns The error message if an owner is duplicated, a share is not positive, or the shares do not sum to 100, or null otherwise
 */
export function ownerSharesError(
  shares: Array<{ ownerId: string; percentage: number }>,
): string | null {
  const ids = shares.map((share) => share.ownerId);
  if (new Set(ids).size !== ids.length) {
    return 'Danh sách chủ sở hữu bị trùng';
  }
  if (shares.some((share) => share.percentage <= 0)) {
    return 'Tỷ lệ sở hữu phải lớn hơn 0';
  }
  const totalCents = shares.reduce(
    (sum, share) => sum + Math.round(share.percentage * 100),
    0,
  );
  if (totalCents !== 10000) {
    return 'Tổng tỷ lệ sở hữu phải bằng 100';
  }
  return null;
}

/**
 * Evaluate whether a horse can train and race; training allows UNDER_OBSERVATION health, racing requires ELIGIBLE health
 * @param input The horse state to evaluate
 * @returns The training and racing eligibility with all blocking reasons
 */
export function evaluateEligibility(
  input: EligibilityInput,
): EligibilityResult {
  if (input.isReference) {
    return {
      trainingEligible: false,
      racingEligible: false,
      reasons: [EligibilityReason.REFERENCE_HORSE],
    };
  }

  const reasons: EligibilityReason[] = [];
  const active = input.lifecycleStatus === HorseLifecycleStatus.ACTIVE;
  if (!active) reasons.push(EligibilityReason.LIFECYCLE_NOT_ACTIVE);

  const healthReason = HEALTH_REASONS[input.healthStatus];
  if (healthReason) reasons.push(healthReason);

  if (input.hasActiveTrainingLock) {
    reasons.push(EligibilityReason.ACTIVE_TRAINING_LOCK);
  }

  const trainableHealth =
    input.healthStatus === HorseHealthStatus.ELIGIBLE ||
    input.healthStatus === HorseHealthStatus.UNDER_OBSERVATION;

  return {
    trainingEligible: active && trainableHealth && !input.hasActiveTrainingLock,
    racingEligible:
      active &&
      input.healthStatus === HorseHealthStatus.ELIGIBLE &&
      !input.hasActiveTrainingLock,
    reasons,
  };
}

/**
 * Check a measurement value against the allowed range of its type
 * @param type The measurement type
 * @param value The measured value
 * @returns The error message if the value is out of range, or null otherwise
 */
export function measurementValueError(
  type: HorseMeasurementType,
  value: number,
): string | null {
  const spec = HORSE_MEASUREMENT_SPECS[type];
  if (value < spec.min || value > spec.max) {
    return `${type} phải trong khoảng ${spec.min}–${spec.max} ${spec.unit}`;
  }
  return null;
}

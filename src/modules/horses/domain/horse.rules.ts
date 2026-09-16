import { HorseGender } from '../constants/horse-gender.enum';
import {
  HORSE_MEASUREMENT_SPECS,
  HorseMeasurementType,
} from '../constants/horse-measurement-type.enum';
import {
  HorseHealthStatus,
  HorseLifecycleStatus,
} from '../constants/horse-status.enum';

export interface ParentCandidate {
  id: string;
  gender: HorseGender | null;
  dateOfBirth: string | null;
}

export interface ChildProfile {
  id?: string;
  dateOfBirth?: string | null;
}

export enum EligibilityReason {
  REFERENCE_HORSE = 'REFERENCE_HORSE',
  LIFECYCLE_NOT_ACTIVE = 'LIFECYCLE_NOT_ACTIVE',
  HEALTH_UNDER_OBSERVATION = 'HEALTH_UNDER_OBSERVATION',
  HEALTH_INJURED = 'HEALTH_INJURED',
  HEALTH_QUARANTINED = 'HEALTH_QUARANTINED',
  ACTIVE_TRAINING_LOCK = 'ACTIVE_TRAINING_LOCK',
}

export interface EligibilityInput {
  isReference: boolean;
  lifecycleStatus: HorseLifecycleStatus;
  healthStatus: HorseHealthStatus;
  hasActiveTrainingLock: boolean;
}

export interface EligibilityResult {
  trainingEligible: boolean;
  racingEligible: boolean;
  reasons: EligibilityReason[];
}

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

const HEALTH_REASONS: Partial<Record<HorseHealthStatus, EligibilityReason>> = {
  [HorseHealthStatus.UNDER_OBSERVATION]:
    EligibilityReason.HEALTH_UNDER_OBSERVATION,
  [HorseHealthStatus.INJURED]: EligibilityReason.HEALTH_INJURED,
  [HorseHealthStatus.QUARANTINED]: EligibilityReason.HEALTH_QUARANTINED,
};

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

export function canTransitionLifecycle(
  from: HorseLifecycleStatus,
  to: HorseLifecycleStatus,
): boolean {
  return LIFECYCLE_TRANSITIONS[from].includes(to);
}

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

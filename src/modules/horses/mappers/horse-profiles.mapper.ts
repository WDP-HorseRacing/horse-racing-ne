import type {
  HorseDetailResponseDto,
  HorseListItemDto,
  HorseStallSummaryDto,
} from '../dto/horse.dto';
import type { HorseEntity } from '../entities/horse.entity';
import { evaluateEligibility } from '../policies/horse.policy';
import { toLatestMeasurement } from './horse-measurements.mapper';
import { toHorseResponse } from './horse.mapper';
import type {
  HorseCurrentStallRow,
  HorseDetailParts,
  HorseDetailVisibility,
} from '../types/horse.types';

/**
 * Map a horse to a list item with its current stall and race registration flag.
 *
 * @param horse The horse entity
 * @param location The current stall of the horse, or null if not assigned
 * @param hasActiveTrainingLock Whether the horse has an active training lock
 * @returns The horse list item
 */
export function toHorseListItem(
  horse: HorseEntity,
  location: HorseCurrentStallRow | null,
  hasActiveTrainingLock: boolean,
): HorseListItemDto {
  return {
    ...toHorseResponse(horse),
    stall: toStallSummary(location),
    canRegisterRace: evaluateEligibility({
      isReference: horse.isReference,
      lifecycleStatus: horse.lifecycleStatus,
      healthStatus: horse.healthStatus,
      hasActiveTrainingLock,
    }).racingEligible,
  };
}

/**
 * Convert the current stall row to the horse profile's stall summary.
 *
 * @param location The current stall of the horse, or null if not assigned
 * @returns The stall summary, or null if the horse has no current stall
 */
export function toStallSummary(
  location: HorseCurrentStallRow | null,
): HorseStallSummaryDto | null {
  return location
    ? {
        id: location.stallId,
        code: location.stallCode,
        barn: { id: location.barnId, name: location.barnName },
      }
    : null;
}

/**
 * Build the horse detail response from its profile and already-loaded related data.
 * Fields hidden from the caller are omitted rather than returned as null.
 *
 * @param horse The horse entity
 * @param parts The stall, groom, representative owner, measurements and training lock
 * @param visibility Whether the caller can see parent IDs and the representative owner
 * @returns The horse detail response
 */
export function toHorseDetailResponse(
  horse: HorseEntity,
  parts: HorseDetailParts,
  visibility: HorseDetailVisibility,
): HorseDetailResponseDto {
  const { sireId, damId, ...profile } = toHorseResponse(horse);
  return {
    ...profile,
    ...(visibility.includeParents ? { sireId, damId } : {}),
    stall: toStallSummary(parts.stall),
    groom: parts.groom,
    ...(visibility.includeRepresentativeOwner
      ? { representativeOwner: parts.representativeOwner }
      : {}),
    latestMeasurements: parts.latestMeasurements.map(toLatestMeasurement),
    activeTrainingLock: parts.activeTrainingLock,
  };
}

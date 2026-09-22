import type { HorseOwnershipResponseDto } from '../dto/horse.dto';
import type { HorseOwnershipEntity } from '../entities/horse-ownership.entity';
import { requiredRelationName } from './horse.mapper';

/**
 * Map an ownership row, including the owner's email only when the caller may see it.
 *
 * @param entity The ownership entity with its owner relation loaded
 * @param includeEmail Whether the caller may see the owner's email
 * @returns The ownership response
 */
export function toOwnershipResponse(
  entity: HorseOwnershipEntity,
  includeEmail: boolean,
): HorseOwnershipResponseDto {
  return {
    id: entity.id,
    horseId: entity.horseId,
    ownerId: entity.ownerId,
    ownerName: requiredRelationName(entity.owner, 'owner'),
    ...(includeEmail && entity.owner ? { ownerEmail: entity.owner.email } : {}),
    percentage: entity.percentage,
    startAt: entity.startAt,
    endAt: entity.endAt,
    isRepresentative: entity.isRepresentative,
  };
}

/**
 * Map a co-owner row to the reduced response shown to another horse owner.
 *
 * @param entity The ownership entity with its owner relation loaded
 * @returns The reduced co-owner response
 */
export function toCoOwnerResponse(
  entity: HorseOwnershipEntity,
): HorseOwnershipResponseDto {
  return {
    ownerName: requiredRelationName(entity.owner, 'owner'),
    percentage: entity.percentage,
    isRepresentative: entity.isRepresentative,
  };
}

import { plainToInstance } from 'class-transformer';
import { HorseResponseDto } from '../dto/horse.dto';
import type { HorseEntity } from '../entities/horse.entity';

/**
 * Convert the shared horse profile fields to the public response DTO.
 *
 * @param entity The horse entity
 * @returns The public horse response
 */
export function toHorseResponse(entity: HorseEntity): HorseResponseDto {
  return plainToInstance(HorseResponseDto, entity, {
    excludeExtraneousValues: true,
  });
}

/**
 * Read a relation's user name and fail clearly when the relation was not loaded.
 *
 * @param user The related user, if loaded
 * @param relation The relation name used in the error message
 * @returns The user's full name
 */
export function requiredRelationName(
  user: { fullName: string } | null | undefined,
  relation: 'owner' | 'measurer',
): string {
  if (!user) {
    throw new Error(
      `Quan hệ ${relation} chưa được load khi ánh xạ dữ liệu ngựa`,
    );
  }
  return user.fullName;
}

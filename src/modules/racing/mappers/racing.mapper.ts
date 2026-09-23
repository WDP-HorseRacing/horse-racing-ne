import { HorseRaceResultResponseDto } from '../dto/horse-race-result.response.dto';
import type { RaceRegistrationEntity } from '../entities/race-registration.entity';

/**
 * Map a race registration with its loaded race relation to the public result DTO.
 *
 * Keeping this projection in the mapper prevents the service from exposing an
 * entity shape and makes the response contract explicit.
 */
export function toHorseRaceResultResponse(
  registration: RaceRegistrationEntity,
): HorseRaceResultResponseDto {
  if (!registration.race) {
    throw new Error(
      'Quan hệ race chưa được load khi ánh xạ lịch sử thi đấu của ngựa',
    );
  }

  return {
    registrationId: registration.id,
    raceId: registration.race.id,
    raceName: registration.race.name,
    scheduledAt: registration.race.scheduledAt,
    raceStatus: registration.race.status,
    registrationStatus: registration.status,
    placing: registration.placing,
    timeSeconds: registration.timeSeconds,
  };
}

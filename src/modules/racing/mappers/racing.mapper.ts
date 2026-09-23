import { HorseRaceResultResponseDto } from '../dto/horse-race-result.response.dto';
import { RaceRegistrationEntity } from '../entities/race-registration.entity';

/**
 * Chuyển một đăng ký thi đấu (kèm cuộc đua) sang dòng kết quả thi đấu của con ngựa
 *
 * - Lấy tên, lịch, trạng thái cuộc đua từ quan hệ `race`, nơi gọi phải tải kèm quan hệ này
 * - placing, timeSeconds giữ null khi cuộc đua chưa có kết quả
 *
 * @param registration Đăng ký thi đấu đã tải kèm cuộc đua
 * @returns HorseRaceResultResponseDto - Một dòng kết quả thi đấu của con ngựa
 */
export function toHorseRaceResultResponse(
  registration: RaceRegistrationEntity,
): HorseRaceResultResponseDto {
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

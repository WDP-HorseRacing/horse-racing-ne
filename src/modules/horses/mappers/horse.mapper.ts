import { plainToInstance } from 'class-transformer';
import { HorseResponseDto } from '../dto';
import type { HorseEntity } from '../entities/horse.entity';

/**
 * Chuyển các field hồ sơ ngựa dùng chung sang response DTO công khai
 *
 * @param entity Hồ sơ ngựa
 * @returns Response hồ sơ ngựa công khai
 */
export function toHorseResponse(entity: HorseEntity): HorseResponseDto {
  return plainToInstance(HorseResponseDto, entity, {
    excludeExtraneousValues: true,
  });
}

import { HorseResponseDto } from '../dto/horse.response.dto';
import { HorseEntity } from '../entities/horse.entity';

export function toHorseResponse(entity: HorseEntity): HorseResponseDto {
  return { id: entity.id, name: entity.name };
}

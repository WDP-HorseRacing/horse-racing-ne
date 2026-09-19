import { plainToInstance } from 'class-transformer';
import { SupplyItemResponseDto } from '../dto/supply-item.dto';
import type { SupplyItemEntity } from '../entities/supply-item.entity';

const MAPPER_OPTIONS = { excludeExtraneousValues: true } as const;

export function toSupplyItemResponse(
  entity: SupplyItemEntity,
): SupplyItemResponseDto {
  return plainToInstance(SupplyItemResponseDto, entity, MAPPER_OPTIONS);
}

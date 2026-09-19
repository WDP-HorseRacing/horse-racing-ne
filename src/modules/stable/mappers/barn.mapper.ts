import { plainToInstance } from 'class-transformer';
import { BarnResponseDto } from '../dto/barn.dto';
import type { BarnEntity } from '../entities/barn.entity';

const MAPPER_OPTIONS = { excludeExtraneousValues: true } as const;

/**
 * Ánh xạ BarnEntity sang BarnResponseDto, loại bỏ các thuộc tính nội bộ (soft-delete, version, audit).
 * @param entity BarnEntity cần chuyển đổi
 * @returns BarnResponseDto
 */
export function toBarnResponse(entity: BarnEntity): BarnResponseDto {
  return plainToInstance(BarnResponseDto, entity, MAPPER_OPTIONS);
}

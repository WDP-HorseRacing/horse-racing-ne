import { plainToInstance } from 'class-transformer';
import { StallAssignmentResponseDto, StallResponseDto } from '../dto/stall.dto';
import type { StallAssignmentEntity } from '../entities/stall-assignment.entity';
import type { StallEntity } from '../entities/stall.entity';

const MAPPER_OPTIONS = { excludeExtraneousValues: true } as const;

/**
 * Ánh xạ StallEntity sang StallResponseDto, loại bỏ các thuộc tính nội bộ (soft-delete, version, audit).
 * @param entity StallEntity cần chuyển đổi
 * @returns StallResponseDto
 */
export function toStallResponse(entity: StallEntity): StallResponseDto {
  return plainToInstance(StallResponseDto, entity, MAPPER_OPTIONS);
}

/**
 * Ánh xạ StallAssignmentEntity sang StallAssignmentResponseDto kèm thông tin ngựa
 * @param entity StallAssignmentEntity cần chuyển đổi
 * @returns StallAssignmentResponseDto
 */
export function toStallAssignmentResponse(
  entity: StallAssignmentEntity,
): StallAssignmentResponseDto {
  return plainToInstance(StallAssignmentResponseDto, entity, MAPPER_OPTIONS);
}

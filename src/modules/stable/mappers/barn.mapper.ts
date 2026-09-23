import { plainToInstance } from 'class-transformer';
import { BarnListItemDto, BarnResponseDto } from '../dto/barn.dto';
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

/**
 * Ánh xạ BarnEntity (đã nạp headTrainer) sang một dòng danh sách khu, kèm tên Head Trainer, số chỗ còn nhận và số ngựa chờ xếp ô.
 * @param entity BarnEntity cần chuyển đổi, có quan hệ headTrainer đã nạp
 * @param hasActiveHeadTrainer true nếu Head Trainer phụ trách còn ACTIVE và còn vai trò HEAD_TRAINER
 * @param availableStallCount Số chỗ khu còn nhận ngựa mới (ô trống đã trừ ngựa chờ xếp ô, không âm)
 * @param pendingStallHorseCount Số ngựa đã thuộc khu nhưng chưa có ô
 * @returns BarnListItemDto
 */
export function toBarnListItem(
  entity: BarnEntity,
  hasActiveHeadTrainer: boolean,
  availableStallCount: number,
  pendingStallHorseCount: number,
): BarnListItemDto {
  return plainToInstance(
    BarnListItemDto,
    {
      ...entity,
      headTrainerFullName: entity.headTrainer?.fullName ?? null,
      hasActiveHeadTrainer,
      availableStallCount,
      pendingStallHorseCount,
    },
    MAPPER_OPTIONS,
  );
}

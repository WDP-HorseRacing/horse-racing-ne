import { plainToInstance } from 'class-transformer';
import { compareDecimal } from '../../../common/utils/decimal';
import {
  SupplyItemResponseDto,
  SupplyStockMovementResponseDto,
} from '../dto/supply-item.dto';
import type { SupplyItemEntity } from '../entities/supply-item.entity';
import type { SupplyStockMovementEntity } from '../entities/supply-stock-movement.entity';

const MAPPER_OPTIONS = { excludeExtraneousValues: true } as const;

/**
 * Chuyển vật tư sang response, kèm cờ sắp hết
 *
 * @param entity Vật tư; cần load quan hệ lastCounter (kể cả người đã xóa) nếu đã từng kiểm kê
 * @returns Response của vật tư
 * @throws Error Nếu vật tư đã kiểm kê mà chưa load lastCounter
 */
export function toSupplyItemResponse(
  entity: SupplyItemEntity,
): SupplyItemResponseDto {
  return plainToInstance(
    SupplyItemResponseDto,
    {
      ...entity,
      lowStock:
        compareDecimal(entity.quantityOnHand, entity.reorderThreshold) <= 0,
      lastCounter: entity.lastCountedBy
        ? requiredRelation(entity.lastCounter, 'lastCounter')
        : null,
    },
    MAPPER_OPTIONS,
  );
}

/**
 * Chuyển một dòng sổ nhập xuất sang response
 *
 * @param entity Dòng sổ, đã load quan hệ creator
 * @returns Response của dòng sổ
 */
export function toSupplyStockMovementResponse(
  entity: SupplyStockMovementEntity,
): SupplyStockMovementResponseDto {
  return plainToInstance(
    SupplyStockMovementResponseDto,
    entity,
    MAPPER_OPTIONS,
  );
}

/**
 * Lấy quan hệ bắt buộc đã load
 *
 * @param relation Giá trị quan hệ
 * @param name Tên quan hệ, dùng trong câu báo lỗi
 * @returns Quan hệ đã load
 * @throws Error Nếu quan hệ chưa được load
 */
function requiredRelation<T>(relation: T | null | undefined, name: string): T {
  if (!relation) {
    throw new Error(`Quan hệ ${name} chưa được load khi ánh xạ vật tư`);
  }
  return relation;
}

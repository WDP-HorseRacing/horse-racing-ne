import { plainToInstance } from 'class-transformer';
import { compareDecimal, multiplyDecimal } from '../../../common/utils/decimal';
import {
  SupplyItemResponseDto,
  SupplyLotResponseDto,
  SupplyStockMovementResponseDto,
} from '../dto/supply-item.dto';
import type { SupplyItemEntity } from '../entities/supply-item.entity';
import type { SupplyLotEntity } from '../entities/supply-lot.entity';
import type { SupplyStockMovementEntity } from '../entities/supply-stock-movement.entity';

const MAPPER_OPTIONS = { excludeExtraneousValues: true } as const;

/**
 * Chuyển vật tư sang response, kèm cờ sắp hết
 *
 * @param entity Vật tư
 * @returns Response của vật tư
 */
export function toSupplyItemResponse(
  entity: SupplyItemEntity,
): SupplyItemResponseDto {
  return plainToInstance(
    SupplyItemResponseDto,
    {
      ...entity,
      quantityOnHand: Number(entity.quantityOnHand),
      reorderThreshold: Number(entity.reorderThreshold),
      lowStock:
        compareDecimal(entity.quantityOnHand, entity.reorderThreshold) <= 0,
    },
    MAPPER_OPTIONS,
  );
}

/**
 * Chuyển một dòng sổ nhập xuất sang response, kèm đơn giá lô và tiền của dòng
 *
 * - Dòng không gắn lô (ghi trước khi có lô): đơn giá và tiền là null
 * - Tiền = chênh lệch × đơn giá lô, làm tròn tới đồng
 *
 * @param entity Dòng sổ, đã load quan hệ creator và lot
 * @returns Response của dòng sổ
 */
export function toSupplyStockMovementResponse(
  entity: SupplyStockMovementEntity,
): SupplyStockMovementResponseDto {
  const unitPrice = entity.lot?.unitPrice ?? null;
  return plainToInstance(
    SupplyStockMovementResponseDto,
    {
      ...entity,
      delta: Number(entity.delta),
      balanceAfter: Number(entity.balanceAfter),
      unitPrice: unitPrice === null ? null : Number(unitPrice),
      amount:
        unitPrice === null
          ? null
          : Number(multiplyDecimal(entity.delta, unitPrice, 0)),
    },
    MAPPER_OPTIONS,
  );
}

/**
 * Chuyển một lô vật tư sang response
 *
 * @param entity Lô vật tư
 * @returns Response của lô
 */
export function toSupplyLotResponse(
  entity: SupplyLotEntity,
): SupplyLotResponseDto {
  return plainToInstance(
    SupplyLotResponseDto,
    {
      ...entity,
      quantity: Number(entity.quantity),
      remaining: Number(entity.remaining),
      unitPrice: Number(entity.unitPrice),
    },
    MAPPER_OPTIONS,
  );
}

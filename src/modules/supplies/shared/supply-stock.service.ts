import { Injectable, NotFoundException } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import {
  addDecimal,
  roundDecimal,
  subtractDecimal,
} from '../../../common/utils/decimal';
import { SupplyItemEntity } from '../entities/supply-item.entity';
import { SupplyStockMovementEntity } from '../entities/supply-stock-movement.entity';
import { SupplyStockMovementType } from '../enums/supply-stock-movement-type.enum';

const QUANTITY_SCALE = 2;

export const SUPPLY_ITEM_NOT_FOUND = 'Không tìm thấy vật tư';

/**
 * Đổi số tồn vật tư; mỗi lần đổi ghi kèm một dòng sổ nhập xuất trong cùng transaction
 */
@Injectable()
export class SupplyStockService {
  /**
   * Khóa row vật tư chưa xóa để đổi số tồn
   *
   * @param manager EntityManager của transaction đang chạy
   * @param itemId UUID của vật tư
   * @returns Promise trả về vật tư đã khóa
   * @throws NotFoundException Nếu không có vật tư hoặc vật tư đã xóa
   */
  async lockItem(
    manager: EntityManager,
    itemId: string,
  ): Promise<SupplyItemEntity> {
    const item = await manager.findOne(SupplyItemEntity, {
      where: { id: itemId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!item) throw new NotFoundException(SUPPLY_ITEM_NOT_FOUND);
    return item;
  }

  /**
   * Ghi số đếm thực tế của vật tư và dòng sổ COUNT_ADJUST cho phần chênh lệch
   *
   * - Ghi lần kiểm kê gần nhất (ai, lúc nào) vào vật tư
   * - Số đếm bằng số tồn cũ vẫn ghi một dòng sổ với chênh lệch 0
   *
   * @param manager EntityManager của transaction đang chạy
   * @param item Vật tư đã khóa (hoặc vừa tạo) trong transaction
   * @param counted Số đếm thực tế, không âm
   * @param actorId UUID người kiểm kê
   * @param note Ghi chú của lần kiểm kê
   * @returns Promise trả về vật tư sau khi lưu
   */
  async recordCount(
    manager: EntityManager,
    item: SupplyItemEntity,
    counted: string,
    actorId: string,
    note: string | null,
  ): Promise<SupplyItemEntity> {
    const balance = roundDecimal(counted, QUANTITY_SCALE);
    const delta = subtractDecimal(balance, item.quantityOnHand, QUANTITY_SCALE);
    item.quantityOnHand = balance;
    item.lastCountedAt = new Date();
    item.lastCountedBy = actorId;
    const saved = await manager.save(item);
    await this.appendMovement(manager, {
      itemId: item.id,
      delta,
      balanceAfter: balance,
      type: SupplyStockMovementType.COUNT_ADJUST,
      requestId: null,
      note,
      createdBy: actorId,
    });
    return saved;
  }

  /**
   * Cộng số lượng cấp theo đề xuất vào tồn và ghi dòng sổ RESTOCK gắn đề xuất
   *
   * @param manager EntityManager của transaction đang chạy
   * @param itemId UUID của vật tư
   * @param quantity Số lượng cấp, lớn hơn 0
   * @param requestId UUID của đề xuất được cấp
   * @param actorId UUID người cấp
   * @returns Promise hoàn tất khi đã cộng tồn và ghi sổ
   * @throws NotFoundException Nếu vật tư đã xóa
   */
  async restock(
    manager: EntityManager,
    itemId: string,
    quantity: string,
    requestId: string,
    actorId: string,
  ): Promise<void> {
    const item = await this.lockItem(manager, itemId);
    item.quantityOnHand = addDecimal(
      item.quantityOnHand,
      quantity,
      QUANTITY_SCALE,
    );
    await manager.save(item);
    await this.appendMovement(manager, {
      itemId,
      delta: roundDecimal(quantity, QUANTITY_SCALE),
      balanceAfter: item.quantityOnHand,
      type: SupplyStockMovementType.RESTOCK,
      requestId,
      note: null,
      createdBy: actorId,
    });
  }

  /**
   * Thêm một dòng sổ nhập xuất; thời điểm ghi lấy theo đồng hồ lúc chèn dòng
   *
   * @param manager EntityManager của transaction đang chạy
   * @param movement Nội dung dòng sổ
   * @returns Promise hoàn tất khi đã ghi
   */
  private async appendMovement(
    manager: EntityManager,
    movement: Pick<
      SupplyStockMovementEntity,
      | 'itemId'
      | 'delta'
      | 'balanceAfter'
      | 'type'
      | 'requestId'
      | 'note'
      | 'createdBy'
    >,
  ): Promise<void> {
    await manager
      .createQueryBuilder()
      .insert()
      .into(SupplyStockMovementEntity)
      .values({ ...movement, createdAt: () => 'clock_timestamp()' })
      .execute();
  }
}

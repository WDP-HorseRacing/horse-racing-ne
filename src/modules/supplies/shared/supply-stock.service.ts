import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EntityManager, MoreThan } from 'typeorm';
import {
  addDecimal,
  compareDecimal,
  roundDecimal,
  subtractDecimal,
} from '../../../common/utils/decimal';
import { SupplyItemEntity } from '../entities/supply-item.entity';
import { SupplyLotEntity } from '../entities/supply-lot.entity';
import { SupplyStockMovementEntity } from '../entities/supply-stock-movement.entity';
import { SupplyStockMovementType } from '../enums/supply-stock-movement-type.enum';

const QUANTITY_SCALE = 2;

export const SUPPLY_ITEM_NOT_FOUND = 'Không tìm thấy vật tư';

/**
 * Phần một lần xuất dùng lấy từ một lô
 */
export interface LotTaking {
  lotId: string;
  quantity: string;
  unitPrice: string;
}

/**
 * Đổi số tồn vật tư theo lô; mỗi lần đổi ghi kèm dòng sổ nhập xuất gắn lô trong cùng transaction
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
   * Nhập một lô vào vật tư đã khóa (hoặc vừa tạo): tạo lô, cộng tồn, ghi dòng sổ gắn lô
   *
   * - Thời điểm lô lấy theo đồng hồ lúc chèn dòng, để thứ tự lô đúng thứ tự vào kho
   *
   * @param manager EntityManager của transaction đang chạy
   * @param item Vật tư đã khóa hoặc vừa tạo trong transaction
   * @param entry Số lượng, đơn giá, loại dòng sổ (OPENING hoặc RESTOCK), người nhập, đề xuất được cấp (nếu có), ghi chú
   * @returns Promise trả về số tồn trước khi nhập, vật tư sau khi lưu và lô vừa tạo
   */
  async addLot(
    manager: EntityManager,
    item: SupplyItemEntity,
    entry: {
      quantity: string;
      unitPrice: string;
      type: SupplyStockMovementType.OPENING | SupplyStockMovementType.RESTOCK;
      actorId: string;
      requestId: string | null;
      note: string | null;
    },
  ): Promise<{
    previousQuantity: string;
    item: SupplyItemEntity;
    lot: SupplyLotEntity;
  }> {
    const quantity = roundDecimal(entry.quantity, QUANTITY_SCALE);
    const previousQuantity = item.quantityOnHand;
    const inserted = await manager
      .createQueryBuilder()
      .insert()
      .into(SupplyLotEntity)
      .values({
        itemId: item.id,
        quantity,
        remaining: quantity,
        unitPrice: entry.unitPrice,
        createdAt: () => 'clock_timestamp()',
      })
      .execute();
    const lot = await manager.findOneByOrFail(SupplyLotEntity, {
      id: (inserted.identifiers[0] as { id: string }).id,
    });
    item.quantityOnHand = addDecimal(
      item.quantityOnHand,
      quantity,
      QUANTITY_SCALE,
    );
    const saved = await manager.save(item);
    await this.appendMovement(manager, {
      itemId: item.id,
      lotId: lot.id,
      delta: quantity,
      balanceAfter: item.quantityOnHand,
      type: entry.type,
      requestId: entry.requestId,
      note: entry.note,
      createdBy: entry.actorId,
    });
    return { previousQuantity, item: saved, lot };
  }

  /**
   * Nhập hàng vào vật tư: khóa vật tư rồi nhập một lô với dòng sổ RESTOCK
   *
   * - Cấp theo đề xuất: dòng sổ gắn mã đề xuất
   * - Nhập trực tiếp: requestId là null
   *
   * @param manager EntityManager của transaction đang chạy
   * @param itemId UUID của vật tư
   * @param entry Số lượng, đơn giá (VND) thực trả, người nhập, đề xuất được cấp (nếu có), ghi chú
   * @returns Promise trả về số tồn trước khi nhập, vật tư sau khi lưu và lô vừa tạo
   * @throws NotFoundException Nếu không có vật tư hoặc vật tư đã xóa
   */
  async restock(
    manager: EntityManager,
    itemId: string,
    entry: {
      quantity: string;
      unitPrice: string;
      actorId: string;
      requestId: string | null;
      note: string | null;
    },
  ): Promise<{
    previousQuantity: string;
    item: SupplyItemEntity;
    lot: SupplyLotEntity;
  }> {
    const item = await this.lockItem(manager, itemId);
    return this.addLot(manager, item, {
      ...entry,
      type: SupplyStockMovementType.RESTOCK,
    });
  }

  /**
   * Xuất dùng theo nhập trước xuất trước: trừ các lô còn hàng nhập sớm nhất trước
   *
   * - Khóa các lô còn hàng của vật tư theo thứ tự nhập
   * - Mỗi lô bị trừ ghi một dòng sổ USAGE gắn lô đó
   *
   * @param manager EntityManager của transaction đang chạy
   * @param item Vật tư đã khóa trong transaction
   * @param quantity Số lượng lấy dùng, lớn hơn 0
   * @param actorId UUID người lấy
   * @param note Ghi chú của lần lấy
   * @returns Promise trả về vật tư sau khi lưu và phần lấy từ từng lô theo thứ tự trừ
   * @throws ConflictException Nếu số lượng lấy lớn hơn số tồn
   * @throws Error Nếu tổng số còn của các lô nhỏ hơn số tồn của vật tư
   */
  async consume(
    manager: EntityManager,
    item: SupplyItemEntity,
    quantity: string,
    actorId: string,
    note: string | null,
  ): Promise<{ item: SupplyItemEntity; takings: LotTaking[] }> {
    let left = roundDecimal(quantity, QUANTITY_SCALE);
    if (compareDecimal(left, item.quantityOnHand) > 0) {
      throw new ConflictException('Số lượng lấy lớn hơn số tồn');
    }
    const lots = await manager.find(SupplyLotEntity, {
      where: { itemId: item.id, remaining: MoreThan('0') },
      order: { createdAt: 'ASC', id: 'ASC' },
      lock: { mode: 'pessimistic_write' },
    });
    const takings: LotTaking[] = [];
    for (const lot of lots) {
      if (compareDecimal(left, '0') <= 0) break;
      const taken =
        compareDecimal(lot.remaining, left) < 0 ? lot.remaining : left;
      lot.remaining = subtractDecimal(lot.remaining, taken, QUANTITY_SCALE);
      await manager.save(lot);
      item.quantityOnHand = subtractDecimal(
        item.quantityOnHand,
        taken,
        QUANTITY_SCALE,
      );
      await this.appendMovement(manager, {
        itemId: item.id,
        lotId: lot.id,
        delta: subtractDecimal('0', taken, QUANTITY_SCALE),
        balanceAfter: item.quantityOnHand,
        type: SupplyStockMovementType.USAGE,
        requestId: null,
        note,
        createdBy: actorId,
      });
      takings.push({
        lotId: lot.id,
        quantity: taken,
        unitPrice: lot.unitPrice,
      });
      left = subtractDecimal(left, taken, QUANTITY_SCALE);
    }
    if (compareDecimal(left, '0') > 0) {
      throw new Error(
        `Tổng số còn của các lô nhỏ hơn số tồn của vật tư ${item.id}`,
      );
    }
    return { item: await manager.save(item), takings };
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
      | 'lotId'
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

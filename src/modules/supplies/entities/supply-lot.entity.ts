import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { MutableRecordEntity } from '../../../common/database/base-record.entity';
import { SupplyItemEntity } from './supply-item.entity';

/**
 * Một lô vật tư: một lần hàng vào kho với đơn giá riêng và số còn lại; xuất dùng trừ lô nhập sớm nhất trước
 */
@Entity({ name: 'supply_lots' })
@Index('supply_lots_item_created_idx', ['itemId', 'createdAt'])
@Check('supply_lots_quantity_positive_ck', '"quantity" > 0')
@Check(
  'supply_lots_remaining_range_ck',
  '"remaining" >= 0 AND "remaining" <= "quantity"',
)
@Check('supply_lots_unit_price_nonnegative_ck', '"unit_price" >= 0')
export class SupplyLotEntity extends MutableRecordEntity {
  @Column({ name: 'item_id', type: 'uuid' })
  itemId!: string;

  @ManyToOne(() => SupplyItemEntity, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({
    name: 'item_id',
    foreignKeyConstraintName: 'supply_lots_item_fk',
  })
  item!: SupplyItemEntity;

  @Column({ type: 'numeric', precision: 12, scale: 2 })
  quantity!: string;

  @Column({ type: 'numeric', precision: 12, scale: 2 })
  remaining!: string;

  @Column({ name: 'unit_price', type: 'bigint' })
  unitPrice!: string;
}

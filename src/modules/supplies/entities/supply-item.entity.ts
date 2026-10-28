import { Check, Column, Entity } from 'typeorm';
import { SoftDeletableRecordEntity } from '../../../common/database/base-record.entity';
import { SupplyCategory } from '../enums/supply-category.enum';

/**
 * SupplyItemEntity: vật tư / hàng hóa tồn kho của club.
 * Dùng để quản lý tên, đơn vị, số lượng hiện có và mức đặt hàng lại.
 *
 * - Tên duy nhất không phân biệt hoa thường trong các vật tư chưa xóa: unique index `supply_items_name_uq` trên `lower(name)`, chỉ khai trong migration
 */
@Entity({ name: 'supply_items' })
@Check(
  'supply_items_quantity_on_hand_nonnegative_ck',
  '"quantity_on_hand" >= 0',
)
@Check(
  'supply_items_reorder_threshold_nonnegative_ck',
  '"reorder_threshold" >= 0',
)
export class SupplyItemEntity extends SoftDeletableRecordEntity {
  @Column({ type: 'varchar', length: 160 })
  name!: string;

  @Column({ type: 'varchar', length: 32, enum: SupplyCategory })
  category!: SupplyCategory;

  @Column({ type: 'varchar', length: 32 })
  unit!: string;

  // số lượng tồn kho
  @Column({
    name: 'quantity_on_hand',
    type: 'numeric',
    precision: 12,
    scale: 2,
    default: 0,
  })
  quantityOnHand!: string;

  // ngưỡng tồn kho tối thiểu
  @Column({
    name: 'reorder_threshold',
    type: 'numeric',
    precision: 12,
    scale: 2,
    default: 0,
  })
  reorderThreshold!: string;
}

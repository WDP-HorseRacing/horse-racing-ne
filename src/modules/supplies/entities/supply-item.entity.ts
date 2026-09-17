import { Column, Entity, Index } from 'typeorm';
import { SoftDeletableRecordEntity } from '../../../common/database/base-record.entity';
import { SupplyCategory } from '../constants/supply-category.enum';

/**
 * SupplyItemEntity: vật tư / hàng hóa tồn kho của club.
 * Dùng để quản lý tên, đơn vị, số lượng hiện có và mức đặt hàng lại.
 */
@Entity({ name: 'supply_items' })
@Index('supply_items_name_uq', ['name'], {
  unique: true,
  where: 'deleted_at IS NULL',
})
export class SupplyItemEntity extends SoftDeletableRecordEntity {
  @Column({ type: 'varchar', length: 160 })
  name!: string;

  @Column({ type: 'varchar', length: 32, enum: SupplyCategory })
  category!: SupplyCategory;

  @Column({ type: 'varchar', length: 32 })
  unit!: string;

  @Column({
    name: 'quantity_on_hand',
    type: 'numeric',
    precision: 12,
    scale: 2,
    default: 0,
  })
  quantityOnHand!: string;

  @Column({
    name: 'reorder_threshold',
    type: 'numeric',
    precision: 12,
    scale: 2,
    default: 0,
  })
  reorderThreshold!: string;
}

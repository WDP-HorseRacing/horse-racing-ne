import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseRecordEntity } from '../../../common/database/base-record.entity';
import { UserEntity } from '../../users/entities/user.entity';
import { SupplyStockMovementType } from '../enums/supply-stock-movement-type.enum';
import { SupplyItemEntity } from './supply-item.entity';
import { SupplyLotEntity } from './supply-lot.entity';
import { SupplyRequestEntity } from './supply-request.entity';

/**
 * Một dòng sổ nhập xuất: một lần đổi số tồn của vật tư, chỉ thêm, không sửa
 */
@Entity({ name: 'supply_stock_movements' })
@Index('supply_stock_movements_item_created_idx', ['itemId', 'createdAt'])
@Index('supply_stock_movements_request_uq', ['requestId'], {
  unique: true,
  where: 'request_id IS NOT NULL',
})
@Index('supply_stock_movements_usage_idx', ['usageId'], {
  where: 'usage_id IS NOT NULL',
})
@Index('supply_stock_movements_reversal_uq', ['usageId', 'lotId'], {
  unique: true,
  where: `type = 'USAGE_REVERSAL'`,
})
export class SupplyStockMovementEntity extends BaseRecordEntity {
  @Column({ name: 'item_id', type: 'uuid' })
  itemId!: string;

  @ManyToOne(() => SupplyItemEntity, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({
    name: 'item_id',
    foreignKeyConstraintName: 'supply_stock_movements_item_fk',
  })
  item!: SupplyItemEntity;

  @Column({ type: 'numeric', precision: 12, scale: 2 })
  delta!: string;

  @Column({ name: 'balance_after', type: 'numeric', precision: 12, scale: 2 })
  balanceAfter!: string;

  @Column({ type: 'varchar', length: 32 })
  type!: SupplyStockMovementType;

  @Column({ name: 'lot_id', type: 'uuid', nullable: true })
  lotId!: string | null;

  @ManyToOne(() => SupplyLotEntity, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({
    name: 'lot_id',
    foreignKeyConstraintName: 'supply_stock_movements_lot_fk',
  })
  lot!: SupplyLotEntity | null;

  @Column({ name: 'usage_id', type: 'uuid', nullable: true })
  usageId!: string | null;

  @Column({ name: 'request_id', type: 'uuid', nullable: true })
  requestId!: string | null;

  @ManyToOne(() => SupplyRequestEntity, {
    nullable: true,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({
    name: 'request_id',
    foreignKeyConstraintName: 'supply_stock_movements_request_fk',
  })
  request!: SupplyRequestEntity | null;

  @Column({ type: 'text', nullable: true })
  note!: string | null;

  @Column({ name: 'created_by', type: 'uuid' })
  createdBy!: string;

  @ManyToOne(() => UserEntity, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({
    name: 'created_by',
    foreignKeyConstraintName: 'supply_stock_movements_created_by_fk',
  })
  creator!: UserEntity;
}

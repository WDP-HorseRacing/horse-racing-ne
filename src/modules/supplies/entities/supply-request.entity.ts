import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { MutableRecordEntity } from '../../../common/database/base-record.entity';
import { UserEntity } from '../../users/entities/user.entity';
import { SupplyItemEntity } from './supply-item.entity';

@Entity({ name: 'supply_requests' })
@Index('supply_requests_item_status_idx', ['itemId', 'status'])
export class SupplyRequestEntity extends MutableRecordEntity {
  @Column({ name: 'item_id', type: 'uuid' })
  itemId!: string;

  @ManyToOne(() => SupplyItemEntity, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'item_id' })
  item!: SupplyItemEntity;

  @Column({ name: 'requested_by', type: 'uuid' })
  requestedBy!: string;

  @ManyToOne(() => UserEntity, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'requested_by' })
  requester!: UserEntity;

  @Column({ type: 'numeric', precision: 12, scale: 2 })
  quantity!: string;

  @Column({ type: 'varchar', length: 32, default: 'PENDING' })
  status!: string;

  @Column({ type: 'text', nullable: true })
  note!: string | null;
}

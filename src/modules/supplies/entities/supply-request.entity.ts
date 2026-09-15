import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { MutableRecordEntity } from '../../../common/database/base-record.entity';
import { UserEntity } from '../../users/entities/user.entity';
import { SupplyRequestStatus } from '../constants/supply-request-status.enum';
import { SupplyItemEntity } from './supply-item.entity';

/**
 * SupplyRequestEntity: yêu cầu cấp vật tư từ người dùng hoặc bộ phận vận hành.
 * Dùng để lưu số lượng, người yêu cầu và trạng thái duyệt / xử lý.
 */
@Entity({ name: 'supply_requests' })
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

  @Column({
    type: 'varchar',
    length: 32,
    default: SupplyRequestStatus.PENDING,
    enum: SupplyRequestStatus,
  })
  status!: SupplyRequestStatus;

  @Column({ type: 'text', nullable: true })
  note!: string | null;
}

import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { MutableRecordEntity } from '../../../common/database/base-record.entity';
import { UserEntity } from '../../users/entities/user.entity';
import { SupplyRequestStatus } from '../enums/supply-request-status.enum';
import { SupplyItemEntity } from './supply-item.entity';

/**
 * SupplyRequestEntity: yêu cầu cấp vật tư từ người dùng hoặc bộ phận vận hành.
 * Dùng để lưu số lượng, người yêu cầu và trạng thái duyệt / xử lý.
 */
@Entity({ name: 'supply_requests' })
@Index('supply_requests_item_status_idx', ['itemId', 'status'])
@Check('supply_requests_quantity_positive_ck', '"quantity" > 0')
export class SupplyRequestEntity extends MutableRecordEntity {
  @Column({ name: 'item_id', type: 'uuid' })
  itemId!: string;

  @ManyToOne(() => SupplyItemEntity, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'item_id' })
  item!: SupplyItemEntity;

  // người yêu cầu nhập vật tư (GROOM hoặc HEAD-TRAINER hoặc CLUB-MANAGER)
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

  // người duyệt (phải là HEAD-TRAINER hoặc CLUB-MANAGER)
  @Column({ name: 'reviewed_by', type: 'uuid', nullable: true })
  reviewedBy!: string | null;

  @ManyToOne(() => UserEntity, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'reviewed_by' })
  reviewer!: UserEntity | null;

  @Column({ name: 'reviewed_at', type: 'timestamptz', nullable: true })
  reviewedAt!: Date | null;

  // người thực hiện cấp vật tư (GROOM hoặc HEAD-TRAINER hoặc CLUB-MANAGER)
  @Column({ name: 'fulfilled_by', type: 'uuid', nullable: true })
  fulfilledBy!: string | null;

  @ManyToOne(() => UserEntity, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'fulfilled_by' })
  fulfiller!: UserEntity | null;

  @Column({ name: 'fulfilled_at', type: 'timestamptz', nullable: true })
  fulfilledAt!: Date | null;

  @Column({ name: 'rejection_reason', type: 'text', nullable: true })
  rejectionReason!: string | null;
}

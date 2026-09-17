import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { SoftDeletableRecordEntity } from '../../../common/database/base-record.entity';
import { StallStatus } from '../constants/stall-status.enum';
import { BarnEntity } from './barn.entity';

/**
 * StallEntity: biểu diễn một chuồng/ngôi trại trong club.
 * Mỗi chuồng có mã riêng, trạng thái và có thể được gán cho một ngựa
 * thông qua StallAssignmentEntity trong một khoảng thời gian.
 */
@Entity({ name: 'stalls' })
@Index('stalls_code_uq', ['code'], {
  unique: true,
  where: 'deleted_at IS NULL',
})
export class StallEntity extends SoftDeletableRecordEntity {
  @Column({ name: 'barn_id', type: 'uuid' })
  barnId!: string;

  @ManyToOne(() => BarnEntity, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'barn_id' })
  barn!: BarnEntity;

  @Column({ type: 'varchar', length: 80 })
  code!: string;

  @Column({
    type: 'varchar',
    length: 32,
    default: StallStatus.AVAILABLE,
    enum: StallStatus,
  })
  status!: StallStatus;
}

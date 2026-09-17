import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { SoftDeletableRecordEntity } from '../../../common/database/base-record.entity';
import { UserEntity } from '../../users/entities/user.entity';

/**
 * BarnEntity: một khu chuồng trong club, gom nhiều stall.
 * Mỗi khu có tối đa một Head Trainer phụ trách; Head Trainer chỉ được
 * ra quyết định và xem thông tin nhạy cảm của ngựa đang ở khu mình.
 */
@Entity({ name: 'barns' })
@Index('barns_name_uq', ['name'], {
  unique: true,
  where: 'deleted_at IS NULL',
})
export class BarnEntity extends SoftDeletableRecordEntity {
  @Column({ type: 'varchar', length: 80 })
  name!: string;

  @Column({ name: 'head_trainer_id', type: 'uuid', nullable: true })
  headTrainerId!: string | null;

  @ManyToOne(() => UserEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'head_trainer_id' })
  headTrainer!: UserEntity | null;
}

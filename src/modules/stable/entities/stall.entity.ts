import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { SoftDeletableRecordEntity } from '../../../common/database/base-record.entity';
import { ClubEntity } from '../../users/entities/club.entity';
import { StallStatus } from '../constants/stall-status.enum';

/**
 * StallEntity: biểu diễn một chuồng/ngôi trại trong club.
 * Mỗi chuồng có mã riêng, trạng thái và có thể được gán cho một ngựa
 * thông qua StableAssignmentEntity trong một khoảng thời gian.
 */
@Entity({ name: 'stalls' })
@Index('stalls_club_code_uq', ['clubId', 'code'], {
  unique: true,
  where: 'deleted_at IS NULL',
})
export class StallEntity extends SoftDeletableRecordEntity {
  @Column({ name: 'club_id', type: 'uuid' })
  clubId!: string;

  @ManyToOne(() => ClubEntity, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'club_id' })
  club!: ClubEntity;

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

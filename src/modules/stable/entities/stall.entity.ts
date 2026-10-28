import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { SoftDeletableRecordEntity } from '../../../common/database/base-record.entity';
import { StallStatus } from '../constants/stall-status.enum';
import { StallType } from '../constants/stall-type.enum';
import { BarnEntity } from './barn.entity';

/**
 * StallEntity: biểu diễn một ô chuồng trong khu chuồng (Barn).
 * Mỗi chuồng có mã riêng, phân loại mục đích sử dụng (chuẩn, cách ly, hồi phục, đẻ),
 * trạng thái hoạt động và tiện ích giám sát.
 * Có thể được gán cho một ngựa qua StallAssignmentEntity.
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
    default: StallType.STANDARD,
    enum: StallType,
  })
  type!: StallType;

  @Column({
    type: 'varchar',
    length: 32,
    default: StallStatus.AVAILABLE,
    enum: StallStatus,
  })
  status!: StallStatus;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({ name: 'has_camera', type: 'boolean', default: false })
  hasCamera!: boolean;
}

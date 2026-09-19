import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { MutableRecordEntity } from '../../../common/database/base-record.entity';
import { UserEntity } from '../../users/entities/user.entity';
import { HorseEntity } from './horse.entity';

/**
 * HorseOwnershipEntity: lưu lịch sử sở hữu của ngựa theo thời gian.
 * Một ngựa có thể có nhiều owner theo từng giai đoạn, nên dữ liệu được lưu
 * như một bản ghi ownership với startAt/endAt theo khoảng nửa mở [startAt, endAt):
 * chuyển nhượng lúc t thì dòng cũ có endAt = t, dòng mới có startAt = t.
 */
@Entity({ name: 'horse_ownerships' })
@Index('horse_ownerships_owner_active_idx', ['ownerId', 'endAt'])
@Index('horse_ownerships_horse_active_idx', ['horseId', 'endAt'])
@Index('horse_ownerships_active_rep_uq', ['horseId'], {
  unique: true,
  where: 'is_representative AND end_at IS NULL',
})
export class HorseOwnershipEntity extends MutableRecordEntity {
  @Column({ name: 'horse_id', type: 'uuid' })
  horseId!: string;

  @ManyToOne(() => HorseEntity, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'horse_id' })
  horse!: HorseEntity;

  @Column({ name: 'owner_id', type: 'uuid' })
  ownerId!: string;

  @ManyToOne(() => UserEntity, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'owner_id' })
  owner!: UserEntity;

  @Column({ type: 'numeric', precision: 5, scale: 2 })
  percentage!: string;

  @Column({ name: 'start_at', type: 'timestamptz' })
  startAt!: Date;

  @Column({ name: 'end_at', type: 'timestamptz', nullable: true })
  endAt!: Date | null;

  @Column({ name: 'is_representative', type: 'boolean', default: false })
  isRepresentative!: boolean;
}

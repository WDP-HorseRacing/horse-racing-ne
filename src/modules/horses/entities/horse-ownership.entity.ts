import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { MutableRecordEntity } from '../../../common/database/base-record.entity';
import { UserEntity } from '../../users/entities/user.entity';
import { HorseEntity } from './horse.entity';

/**
 * HorseOwnershipEntity: lưu lịch sử sở hữu của ngựa theo thời gian.
 * Một ngựa có thể có nhiều owner theo từng giai đoạn, nên dữ liệu được lưu
 * như một bản ghi ownership với startDate/endDate.
 */
@Entity({ name: 'horse_ownerships' })
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

  @Column({ name: 'start_date', type: 'date' })
  startDate!: string;

  @Column({ name: 'end_date', type: 'date', nullable: true })
  endDate!: string | null;
}

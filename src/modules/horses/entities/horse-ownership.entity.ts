import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { MutableRecordEntity } from '../../../common/database/base-record.entity';
import { UserEntity } from '../../users/entities/user.entity';
import { HorseEntity } from './horse.entity';

/**
 * HorseOwnershipEntity: các giai đoạn sở hữu của một con ngựa.
 * Mỗi ngựa có tối đa một giai đoạn đang mở (ended_at NULL), trùng với horses.owner_id.
 */
@Entity({ name: 'horse_ownerships' })
@Index('horse_ownerships_open_horse_uq', ['horseId'], {
  unique: true,
  where: 'ended_at IS NULL',
})
@Index('horse_ownerships_owner_idx', ['ownerId'])
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

  @Column({ name: 'started_at', type: 'timestamptz' })
  startedAt!: Date;

  @Column({ name: 'ended_at', type: 'timestamptz', nullable: true })
  endedAt!: Date | null;

  @Column({ type: 'text', nullable: true })
  reason!: string | null;

  @Column({ name: 'recorded_by', type: 'uuid', nullable: true })
  recordedBy!: string | null;

  @ManyToOne(() => UserEntity, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'recorded_by' })
  recorder!: UserEntity | null;
}

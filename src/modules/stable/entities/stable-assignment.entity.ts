import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { MutableRecordEntity } from '../../../common/database/base-record.entity';
import { HorseEntity } from '../../horses/entities/horse.entity';
import { UserEntity } from '../../users/entities/user.entity';
import { StallEntity } from './stall.entity';

@Entity({ name: 'stable_assignments' })
@Index('stable_assignments_active_horse_uq', ['horseId'], {
  unique: true,
  where: 'end_at IS NULL',
})
@Index('stable_assignments_active_stall_uq', ['stallId'], {
  unique: true,
  where: 'end_at IS NULL',
})
export class StableAssignmentEntity extends MutableRecordEntity {
  @Column({ name: 'horse_id', type: 'uuid' })
  horseId!: string;

  @ManyToOne(() => HorseEntity, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'horse_id' })
  horse!: HorseEntity;

  @Column({ name: 'stall_id', type: 'uuid' })
  stallId!: string;

  @ManyToOne(() => StallEntity, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'stall_id' })
  stall!: StallEntity;

  @Column({ name: 'groom_id', type: 'uuid' })
  groomId!: string;

  @ManyToOne(() => UserEntity, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'groom_id' })
  groom!: UserEntity;

  @Column({ name: 'start_at', type: 'timestamptz' })
  startAt!: Date;

  @Column({ name: 'end_at', type: 'timestamptz', nullable: true })
  endAt!: Date | null;
}

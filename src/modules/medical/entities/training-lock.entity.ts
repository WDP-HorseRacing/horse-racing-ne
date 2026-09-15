import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { MutableRecordEntity } from '../../../common/database/base-record.entity';
import { HorseEntity } from '../../horses/entities/horse.entity';
import { UserEntity } from '../../users/entities/user.entity';
import { TrainingLockStatus } from '../constants/training-lock.enum';

/**
 * TrainingLockEntity: khóa huấn luyện tạm thời của ngựa vì lý do y tế.
 * Dùng để ngăn ngựa tập luyện trong một khoảng thời gian và ghi lý do mở/giải khóa.
 */
@Entity({ name: 'training_locks' })
@Index('training_locks_active_horse_uq', ['horseId'], {
  unique: true,
  where: `status = '${TrainingLockStatus.ACTIVE}'`,
})
export class TrainingLockEntity extends MutableRecordEntity {
  @Column({ name: 'horse_id', type: 'uuid' })
  horseId!: string;

  @ManyToOne(() => HorseEntity, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'horse_id' })
  horse!: HorseEntity;

  @Column({ name: 'locked_by', type: 'uuid' })
  lockedBy!: string;

  @ManyToOne(() => UserEntity, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'locked_by' })
  veterinarian!: UserEntity;

  @Column({ type: 'text' })
  reason!: string;

  @Column({ name: 'lock_start', type: 'timestamptz' })
  lockStart!: Date;

  @Column({ name: 'lock_end', type: 'timestamptz', nullable: true })
  lockEnd!: Date | null;

  @Column({
    type: 'varchar',
    length: 16,
    default: TrainingLockStatus.ACTIVE,
  })
  status!: TrainingLockStatus;

  @Column({ name: 'released_by', type: 'uuid', nullable: true })
  releasedBy!: string | null;

  @ManyToOne(() => UserEntity, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'released_by' })
  releasingVeterinarian!: UserEntity | null;

  @Column({ name: 'released_at', type: 'timestamptz', nullable: true })
  releasedAt!: Date | null;

  @Column({ name: 'release_conclusion', type: 'text', nullable: true })
  releaseConclusion!: string | null;
}

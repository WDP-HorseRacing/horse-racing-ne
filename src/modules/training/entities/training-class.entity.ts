import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { MutableRecordEntity } from '../../../common/database/base-record.entity';
import { RaceAptitude } from '../../horses/enums/race-aptitude.enum';
import { UserEntity } from '../../users/entities/user.entity';
import { TrainingClassStatus } from '../enums/training-class-status.enum';

@Entity({ name: 'training_classes' })
export class TrainingClassEntity extends MutableRecordEntity {
  @Column({ type: 'varchar', length: 32, unique: true })
  code!: string;

  @Column({ type: 'varchar', length: 160 })
  name!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({
    name: 'race_aptitude',
    type: 'varchar',
    length: 16,
    nullable: true,
  })
  raceAptitude!: RaceAptitude | null;

  @Column({ name: 'max_horses', type: 'int', default: 10 })
  maxHorses!: number;

  @Column({ name: 'head_trainer_id', type: 'uuid', nullable: true })
  headTrainerId!: string | null;

  @ManyToOne(() => UserEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'head_trainer_id' })
  headTrainer!: UserEntity | null;

  @Column({ name: 'start_date', type: 'date' })
  startDate!: string;

  @Column({ name: 'end_date', type: 'date' })
  endDate!: string;

  @Column({
    type: 'varchar',
    length: 32,
    default: TrainingClassStatus.DRAFT,
    enum: TrainingClassStatus,
  })
  status!: TrainingClassStatus;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt!: Date | null;

  @Column({ name: 'cancelled_at', type: 'timestamptz', nullable: true })
  cancelledAt!: Date | null;

  @Column({ name: 'cancel_reason', type: 'text', nullable: true })
  cancelReason!: string | null;
}

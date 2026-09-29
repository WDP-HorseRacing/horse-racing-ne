import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { MutableRecordEntity } from '../../../common/database/base-record.entity';
import { UserEntity } from '../../users/entities/user.entity';
import { TrainingPlanStatus } from '../enums/training-plan-status.enum';
import { TrainingClassEntity } from './training-class.entity';

/**
 * TrainingPlanEntity: kế hoạch huấn luyện chung cho một TrainingClass.
 */
@Entity({ name: 'training_plans' })
@Index('training_plans_active_class_uq', ['classId'], {
  unique: true,
  where: `status = '${TrainingPlanStatus.ACTIVE}'`,
})
export class TrainingPlanEntity extends MutableRecordEntity {
  @Column({ name: 'class_id', type: 'uuid' })
  classId!: string;

  @ManyToOne(() => TrainingClassEntity, {
    nullable: false,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'class_id' })
  trainingClass!: TrainingClassEntity;

  @Column({ type: 'varchar', length: 160 })
  name!: string;

  @Column({ name: 'created_by', type: 'uuid' })
  createdBy!: string;

  @ManyToOne(() => UserEntity, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'created_by' })
  creator!: UserEntity;

  @Column({ name: 'phase_name', type: 'varchar', length: 160 })
  phaseName!: string;

  @Column({ type: 'text' })
  goal!: string;

  @Column({ name: 'start_date', type: 'date' })
  startDate!: string;

  @Column({ name: 'end_date', type: 'date' })
  endDate!: string;

  @Column({
    type: 'varchar',
    length: 32,
    default: TrainingPlanStatus.SCHEDULED,
    enum: TrainingPlanStatus,
  })
  status!: TrainingPlanStatus;

  @Column({ name: 'activated_at', type: 'timestamptz', nullable: true })
  activatedAt!: Date | null;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt!: Date | null;

  @Column({ name: 'cancelled_at', type: 'timestamptz', nullable: true })
  cancelledAt!: Date | null;

  @Column({ name: 'cancel_reason', type: 'text', nullable: true })
  cancelReason!: string | null;
}

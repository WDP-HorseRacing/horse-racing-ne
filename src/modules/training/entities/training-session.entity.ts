import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { MutableRecordEntity } from '../../../common/database/base-record.entity';
import { UserEntity } from '../../users/entities/user.entity';
import { TrainingIntensity } from '../enums/training-intensity.enum';
import { TrainingSessionStatus } from '../enums/training-session-status.enum';
import { TrainingSessionType } from '../enums/training-session-type.enum';
import { TrainingPlanEntity } from './training-plan.entity';

/**
 * TrainingSessionEntity: một thời khóa biểu cụ thể của TrainingPlan.
 * Trạng thái thực thi theo từng Horse nằm ở SessionParticipantEntity.
 */
@Entity({ name: 'training_sessions' })
export class TrainingSessionEntity extends MutableRecordEntity {
  @Column({ name: 'plan_id', type: 'uuid' })
  planId!: string;

  @ManyToOne(() => TrainingPlanEntity, {
    nullable: false,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'plan_id' })
  plan!: TrainingPlanEntity;

  @Column({ type: 'varchar', length: 160 })
  name!: string;

  @Column({
    name: 'session_type',
    type: 'varchar',
    length: 32,
    default: TrainingSessionType.REGULAR,
    enum: TrainingSessionType,
  })
  sessionType!: TrainingSessionType;

  @Column({ type: 'varchar', length: 32, enum: TrainingIntensity })
  intensity!: TrainingIntensity;

  @Column({ name: 'scheduled_start_at', type: 'timestamptz' })
  scheduledStartAt!: Date;

  @Column({ name: 'scheduled_end_at', type: 'timestamptz' })
  scheduledEndAt!: Date;

  @Column({ type: 'varchar', length: 160, nullable: true })
  location!: string | null;

  @Column({ type: 'varchar', length: 80, nullable: true })
  surface!: string | null;

  @Column({ type: 'text', nullable: true })
  notes!: string | null;

  @Column({
    type: 'varchar',
    length: 32,
    default: TrainingSessionStatus.DRAFT,
    enum: TrainingSessionStatus,
  })
  status!: TrainingSessionStatus;

  @Column({ name: 'cancelled_at', type: 'timestamptz', nullable: true })
  cancelledAt!: Date | null;

  @Column({ name: 'cancelled_by', type: 'uuid', nullable: true })
  cancelledBy!: string | null;

  @ManyToOne(() => UserEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'cancelled_by' })
  canceller!: UserEntity | null;

  @Column({ name: 'cancel_reason', type: 'text', nullable: true })
  cancelReason!: string | null;
}

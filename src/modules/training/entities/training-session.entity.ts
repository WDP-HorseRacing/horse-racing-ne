import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { MutableRecordEntity } from '../../../common/database/base-record.entity';
import { UserEntity } from '../../users/entities/user.entity';
import { TrainingSessionStatus } from '../constants/training-session-status.enum';
import { TrainingPlanEntity } from './training-plan.entity';

/**
 * TrainingSessionEntity: buổi tập cụ thể nằm trong một TrainingPlan.
 * Dùng để lên lịch, theo dõi tiến độ và mức độ tập luyện của groom/trainer.
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

  @Column({ name: 'scheduled_at', type: 'timestamptz' })
  scheduledAt!: Date;

  @Column({ name: 'distance_km', type: 'numeric', precision: 8, scale: 2 })
  distanceKm!: number;

  @Column({ name: 'planned_duration_minutes', type: 'integer', nullable: true })
  plannedDurationMinutes!: number | null;

  @Column({ type: 'varchar', length: 32 })
  intensity!: string;

  @Column({ type: 'varchar', length: 80, nullable: true })
  surface!: string | null;

  @Column({ name: 'groom_id', type: 'uuid', nullable: true })
  groomId!: string | null;

  @ManyToOne(() => UserEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'groom_id' })
  groom!: UserEntity | null;

  @Column({
    type: 'varchar',
    length: 32,
    default: TrainingSessionStatus.SCHEDULED,
    enum: TrainingSessionStatus,
  })
  status!: TrainingSessionStatus;

  @Column({ name: 'started_at', type: 'timestamptz', nullable: true })
  startedAt!: Date | null;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt!: Date | null;

  @Column({
    name: 'actual_distance_km',
    type: 'numeric',
    precision: 8,
    scale: 2,
    nullable: true,
  })
  actualDistanceKm!: string | null;

  @Column({ name: 'actual_duration_seconds', type: 'integer', nullable: true })
  actualDurationSeconds!: number | null;

  @Column({ name: 'perceived_effort', type: 'smallint', nullable: true })
  perceivedEffort!: number | null;

  @Column({ name: 'completion_notes', type: 'text', nullable: true })
  completionNotes!: string | null;

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

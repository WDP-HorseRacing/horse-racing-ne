import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { MutableRecordEntity } from '../../../common/database/base-record.entity';
import { UserEntity } from '../../users/entities/user.entity';
import { TrainingPlanEntity } from './training-plan.entity';

@Entity({ name: 'training_sessions' })
@Index('training_sessions_plan_schedule_idx', ['planId', 'scheduledAt'])
@Index('training_sessions_groom_schedule_idx', ['groomId', 'scheduledAt'])
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
  distanceKm!: string;

  @Column({ type: 'varchar', length: 32 })
  intensity!: string;

  @Column({ type: 'varchar', length: 80, nullable: true })
  surface!: string | null;

  @Column({ name: 'groom_id', type: 'uuid', nullable: true })
  groomId!: string | null;

  @ManyToOne(() => UserEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'groom_id' })
  groom!: UserEntity | null;

  @Column({ type: 'varchar', length: 32, default: 'SCHEDULED' })
  status!: string;

  @Column({ name: 'started_at', type: 'timestamptz', nullable: true })
  startedAt!: Date | null;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt!: Date | null;
}

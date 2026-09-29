import { Column, Entity, Index, JoinColumn, OneToOne } from 'typeorm';
import { MutableRecordEntity } from '../../../common/database/base-record.entity';
import { TrainingSessionEntity } from './training-session.entity';

/**
 * TimeTrialEntity: cấu hình Time Trial cho một TrainingSession.
 * Kết quả theo từng Horse nằm ở TrialResultEntity.
 */
@Entity({ name: 'time_trials' })
@Index('time_trials_session_uq', ['sessionId'], { unique: true })
export class TimeTrialEntity extends MutableRecordEntity {
  @Column({ name: 'session_id', type: 'uuid' })
  sessionId!: string;

  @OneToOne(() => TrainingSessionEntity, {
    nullable: false,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({
    name: 'session_id',
    foreignKeyConstraintName: 'FK_time_trials_session',
  })
  session!: TrainingSessionEntity;

  @Column({ name: 'distance_m', type: 'numeric', precision: 10, scale: 2 })
  distanceM!: string;

  @Column({ name: 'target_time_ms', type: 'bigint', nullable: true })
  targetTimeMs!: string | null;

  @Column({ type: 'text', nullable: true })
  notes!: string | null;
}

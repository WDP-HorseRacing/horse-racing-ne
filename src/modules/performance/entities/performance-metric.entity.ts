import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseRecordEntity } from '../../../common/database/base-record.entity';
import { TrainingSessionEntity } from '../../training/entities/training-session.entity';

/**
 * PerformanceMetricEntity: số liệu hiệu suất thu thập trong một buổi tập.
 * Dùng để lưu nhịp tim, tốc độ và mức cảnh báo theo thời gian thực.
 */
@Entity({ name: 'performance_metrics' })
@Index(
  'performance_metrics_source_uq',
  ['sessionId', 'recordedAt', 'sourceId'],
  { unique: true },
)
export class PerformanceMetricEntity extends BaseRecordEntity {
  @Column({ name: 'session_id', type: 'uuid' })
  sessionId!: string;

  @ManyToOne(() => TrainingSessionEntity, {
    nullable: false,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'session_id' })
  session!: TrainingSessionEntity;

  @Column({ name: 'recorded_at', type: 'timestamptz' })
  recordedAt!: Date;

  @Column({ name: 'source_id', type: 'varchar', length: 80 })
  sourceId!: string;

  @Column({ name: 'heart_rate_bpm', type: 'smallint' })
  heartRateBpm!: number;

  @Column({ name: 'speed_mps', type: 'numeric', precision: 8, scale: 3 })
  speedMps!: string;

  @Column({
    name: 'alert_level',
    type: 'varchar',
    length: 16,
    default: 'NORMAL',
  })
  alertLevel!: string;
}

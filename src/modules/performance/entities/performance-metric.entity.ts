import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseRecordEntity } from '../../../common/database/base-record.entity';
import { SessionParticipantEntity } from '../../training/entities/session-participant.entity';

/**
 * PerformanceMetricEntity: số liệu hiệu suất của một Horse trong một participant.
 */
@Entity({ name: 'performance_metrics' })
@Index(
  'performance_metrics_source_uq',
  ['sessionParticipantId', 'recordedAt', 'sourceId'],
  { unique: true },
)
export class PerformanceMetricEntity extends BaseRecordEntity {
  @Column({ name: 'session_participant_id', type: 'uuid' })
  sessionParticipantId!: string;

  @ManyToOne(() => SessionParticipantEntity, {
    nullable: false,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({
    name: 'session_participant_id',
    foreignKeyConstraintName: 'FK_performance_metrics_participant',
  })
  sessionParticipant!: SessionParticipantEntity;

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

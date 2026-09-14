import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { MutableRecordEntity } from '../../../common/database/base-record.entity';
import { TrainingSessionEntity } from './training-session.entity';
import { MediaAssetEntity } from '../../media/entities/media-asset.entity';

@Entity({ name: 'time_trials' })
@Index('time_trials_session_idx', ['sessionId'])
export class TimeTrialEntity extends MutableRecordEntity {
  @Column({ name: 'session_id', type: 'uuid' })
  sessionId!: string;

  @ManyToOne(() => TrainingSessionEntity, {
    nullable: false,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'session_id' })
  session!: TrainingSessionEntity;

  @Column({ name: 'distance_meters', type: 'numeric', precision: 8, scale: 2 })
  distanceMeters!: string;

  @Column({
    name: 'duration_seconds',
    type: 'numeric',
    precision: 10,
    scale: 3,
  })
  durationSeconds!: string;

  @Column({ name: 'video_asset_id', type: 'uuid', nullable: true })
  videoAssetId!: string | null;

  @ManyToOne(() => MediaAssetEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'video_asset_id' })
  videoAsset!: MediaAssetEntity | null;

  @Column({ type: 'text', nullable: true })
  notes!: string | null;
}

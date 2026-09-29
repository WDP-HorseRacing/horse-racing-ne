import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { MutableRecordEntity } from '../../../common/database/base-record.entity';
import { MediaAssetEntity } from '../../media/entities/media-asset.entity';
import { UserEntity } from '../../users/entities/user.entity';
import { SessionParticipantEntity } from './session-participant.entity';
import { TimeTrialEntity } from './time-trial.entity';

@Entity({ name: 'trial_results' })
@Index('trial_results_attempt_uq', [
  'timeTrialId',
  'sessionParticipantId',
  'attemptNo',
], { unique: true })
export class TrialResultEntity extends MutableRecordEntity {
  @Column({ name: 'time_trial_id', type: 'uuid' })
  timeTrialId!: string;

  @ManyToOne(() => TimeTrialEntity, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({
    name: 'time_trial_id',
    foreignKeyConstraintName: 'FK_trial_results_time_trial',
  })
  timeTrial!: TimeTrialEntity;

  @Column({ name: 'session_participant_id', type: 'uuid' })
  sessionParticipantId!: string;

  @ManyToOne(() => SessionParticipantEntity, {
    nullable: false,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({
    name: 'session_participant_id',
    foreignKeyConstraintName: 'FK_trial_results_participant',
  })
  sessionParticipant!: SessionParticipantEntity;

  @Column({ name: 'attempt_no', type: 'integer' })
  attemptNo!: number;

  @Column({ name: 'elapsed_ms', type: 'bigint' })
  elapsedMs!: string;

  @Column({ type: 'text', nullable: true })
  notes!: string | null;

  @Column({ name: 'video_media_id', type: 'uuid', nullable: true })
  videoMediaId!: string | null;

  @ManyToOne(() => MediaAssetEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({
    name: 'video_media_id',
    foreignKeyConstraintName: 'FK_trial_results_video',
  })
  videoMedia!: MediaAssetEntity | null;

  @Column({ name: 'recorded_by', type: 'uuid' })
  recordedBy!: string;

  @ManyToOne(() => UserEntity, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({
    name: 'recorded_by',
    foreignKeyConstraintName: 'FK_trial_results_recorder',
  })
  recorder!: UserEntity;

  @Column({ name: 'recorded_at', type: 'timestamptz' })
  recordedAt!: Date;
}

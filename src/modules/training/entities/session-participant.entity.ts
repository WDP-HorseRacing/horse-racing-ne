import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { MutableRecordEntity } from '../../../common/database/base-record.entity';
import { HorseEntity } from '../../horses/entities/horse.entity';
import { UserEntity } from '../../users/entities/user.entity';
import { SessionParticipantStatus } from '../enums/session-participant-status.enum';
import { HorseEnrollmentEntity } from './horse-enrollment.entity';
import { TrainingSessionEntity } from './training-session.entity';

@Entity({ name: 'session_participants' })
@Index('session_participants_session_horse_uq', ['sessionId', 'horseId'], {
  unique: true,
})
@Index('session_participants_horse_status_idx', ['horseId', 'status'])
@Index('session_participants_groom_status_idx', [
  'assignedGroomId',
  'status',
])
export class SessionParticipantEntity extends MutableRecordEntity {
  @Column({ name: 'session_id', type: 'uuid' })
  sessionId!: string;

  @ManyToOne(() => TrainingSessionEntity, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({
    name: 'session_id',
    foreignKeyConstraintName: 'FK_session_participants_session',
  })
  session!: TrainingSessionEntity;

  @Column({ name: 'horse_id', type: 'uuid' })
  horseId!: string;

  @ManyToOne(() => HorseEntity, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({
    name: 'horse_id',
    foreignKeyConstraintName: 'FK_session_participants_horse',
  })
  horse!: HorseEntity;

  @Column({ name: 'horse_enrollment_id', type: 'uuid' })
  horseEnrollmentId!: string;

  @ManyToOne(() => HorseEnrollmentEntity, {
    nullable: false,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({
    name: 'horse_enrollment_id',
    foreignKeyConstraintName: 'FK_session_participants_enrollment',
  })
  horseEnrollment!: HorseEnrollmentEntity;

  @Column({ name: 'assigned_groom_id', type: 'uuid', nullable: true })
  assignedGroomId!: string | null;

  @ManyToOne(() => UserEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({
    name: 'assigned_groom_id',
    foreignKeyConstraintName: 'FK_session_participants_groom',
  })
  assignedGroom!: UserEntity | null;

  @Column({
    type: 'varchar',
    length: 32,
    default: SessionParticipantStatus.PLANNED,
    enum: SessionParticipantStatus,
  })
  status!: SessionParticipantStatus;

  @Column({ name: 'checked_in_at', type: 'timestamptz', nullable: true })
  checkedInAt!: Date | null;

  @Column({ name: 'started_at', type: 'timestamptz', nullable: true })
  startedAt!: Date | null;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt!: Date | null;

  @Column({ name: 'absence_reason', type: 'text', nullable: true })
  absenceReason!: string | null;

  @Column({ name: 'cancel_reason', type: 'text', nullable: true })
  cancelReason!: string | null;

  @Column({ name: 'ineligibility_reason', type: 'varchar', length: 64, nullable: true })
  ineligibilityReason!: string | null;
}

import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { MutableRecordEntity } from '../../../common/database/base-record.entity';
import { SessionParticipantEntity } from '../../training/entities/session-participant.entity';
import { UserEntity } from '../../users/entities/user.entity';

/**
 * PerformanceEvaluationEntity: đánh giá một Horse sau khi participant COMPLETED.
 */
@Entity({ name: 'performance_evaluations' })
@Index('performance_evaluations_participant_uq', ['sessionParticipantId'], {
  unique: true,
})
export class PerformanceEvaluationEntity extends MutableRecordEntity {
  @Column({ name: 'session_participant_id', type: 'uuid' })
  sessionParticipantId!: string;

  @ManyToOne(() => SessionParticipantEntity, {
    nullable: false,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({
    name: 'session_participant_id',
    foreignKeyConstraintName: 'FK_performance_evaluations_participant',
  })
  sessionParticipant!: SessionParticipantEntity;

  @Column({ name: 'evaluator_id', type: 'uuid' })
  evaluatorId!: string;

  @ManyToOne(() => UserEntity, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'evaluator_id' })
  evaluator!: UserEntity;

  @Column({ type: 'smallint' })
  score!: number;

  @Column({ type: 'text', nullable: true })
  comment!: string | null;
}

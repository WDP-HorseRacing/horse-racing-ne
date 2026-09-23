import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { MutableRecordEntity } from '../../../common/database/base-record.entity';
import { TrainingSessionEntity } from './training-session.entity';
import { UserEntity } from '../../users/entities/user.entity';

/**
 * PerformanceEvaluationEntity: đánh giá kết quả một buổi tập của trainer hoặc giám khảo.
 * Dùng để lưu điểm số và nhận xét chuyên môn.
 */
@Entity({ name: 'performance_evaluations' })
@Index('performance_evaluations_session_uq', ['sessionId'], { unique: true })
export class PerformanceEvaluationEntity extends MutableRecordEntity {
  @Column({ name: 'session_id', type: 'uuid' })
  sessionId!: string;

  @ManyToOne(() => TrainingSessionEntity, {
    nullable: false,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'session_id' })
  session!: TrainingSessionEntity;

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

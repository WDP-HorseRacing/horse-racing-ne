import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseRecordEntity } from '../../../common/database/base-record.entity';
import { TrainingClassPhaseEntity } from './training-class-phase.entity';
import { TrainingSubjectEntity } from './training-subject.entity';

/**
 * TrainingClassPhaseSubjectEntity: một môn học trong giai đoạn của lớp, kèm số buổi tối thiểu mỗi tuần.
 */
@Entity({ name: 'training_class_phase_subjects' })
@Index(
  'training_class_phase_subjects_phase_subject_uq',
  ['phaseId', 'subjectId'],
  { unique: true },
)
@Check(
  'training_class_phase_subjects_min_sessions_ck',
  '"min_sessions_per_week" BETWEEN 1 AND 14',
)
export class TrainingClassPhaseSubjectEntity extends BaseRecordEntity {
  @Column({ name: 'phase_id', type: 'uuid' })
  phaseId!: string;

  @ManyToOne(() => TrainingClassPhaseEntity, (phase) => phase.subjects, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({
    name: 'phase_id',
    foreignKeyConstraintName: 'FK_training_class_phase_subjects_phase',
  })
  phase!: TrainingClassPhaseEntity;

  @Column({ name: 'subject_id', type: 'uuid' })
  subjectId!: string;

  @ManyToOne(() => TrainingSubjectEntity, {
    nullable: false,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({
    name: 'subject_id',
    foreignKeyConstraintName: 'FK_training_class_phase_subjects_subject',
  })
  subject!: TrainingSubjectEntity;

  @Column({ name: 'min_sessions_per_week', type: 'smallint' })
  minSessionsPerWeek!: number;
}

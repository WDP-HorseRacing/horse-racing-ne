import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseRecordEntity } from '../../../common/database/base-record.entity';
import { TrainingPlanPhaseEntity } from './training-plan-phase.entity';
import { TrainingSubjectEntity } from './training-subject.entity';

/**
 * TrainingPlanSubjectEntity: một môn học trong giai đoạn của giáo án, học vào các thứ `weekdays` (ISO: 1 là thứ Hai, 7 là Chủ nhật).
 */
@Entity({ name: 'training_plan_subjects' })
@Index('training_plan_subjects_phase_subject_uq', ['phaseId', 'subjectId'], {
  unique: true,
})
@Check(
  'training_plan_subjects_weekdays_ck',
  'cardinality("weekdays") BETWEEN 1 AND 7 AND "weekdays" <@ ARRAY[1, 2, 3, 4, 5, 6, 7]::smallint[]',
)
export class TrainingPlanSubjectEntity extends BaseRecordEntity {
  @Column({ name: 'phase_id', type: 'uuid' })
  phaseId!: string;

  @ManyToOne(() => TrainingPlanPhaseEntity, (phase) => phase.subjects, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'phase_id' })
  phase!: TrainingPlanPhaseEntity;

  @Column({ name: 'subject_id', type: 'uuid' })
  subjectId!: string;

  @ManyToOne(() => TrainingSubjectEntity, {
    nullable: false,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'subject_id' })
  subject!: TrainingSubjectEntity;

  @Column({ type: 'smallint', array: true })
  weekdays!: number[];
}

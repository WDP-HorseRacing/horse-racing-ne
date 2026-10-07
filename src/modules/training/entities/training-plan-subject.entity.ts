import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseRecordEntity } from '../../../common/database/base-record.entity';
import { TrainingPlanEntity } from './training-plan.entity';
import { TrainingSubjectEntity } from './training-subject.entity';

/**
 * TrainingPlanSubjectEntity: một môn học trong giáo án, học trong `weeks` tuần liên tiếp theo thứ tự `position`.
 */
@Entity({ name: 'training_plan_subjects' })
@Index('training_plan_subjects_position_uq', ['planId', 'position'], {
  unique: true,
})
export class TrainingPlanSubjectEntity extends BaseRecordEntity {
  @Column({ name: 'plan_id', type: 'uuid' })
  planId!: string;

  @ManyToOne(() => TrainingPlanEntity, (plan) => plan.subjects, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'plan_id' })
  plan!: TrainingPlanEntity;

  @Column({ type: 'integer' })
  position!: number;

  @Column({ name: 'subject_id', type: 'uuid' })
  subjectId!: string;

  @ManyToOne(() => TrainingSubjectEntity, {
    nullable: false,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'subject_id' })
  subject!: TrainingSubjectEntity;

  @Column({ type: 'integer' })
  weeks!: number;
}

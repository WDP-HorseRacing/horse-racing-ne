import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
} from 'typeorm';
import { BaseRecordEntity } from '../../../common/database/base-record.entity';
import { TrainingPlanSubjectEntity } from './training-plan-subject.entity';
import { TrainingPlanEntity } from './training-plan.entity';

/**
 * TrainingPlanPhaseEntity: một giai đoạn của giáo án, kéo dài `weeks` tuần liên tiếp theo thứ tự `position`; mỗi giai đoạn có các môn học theo thứ trong tuần.
 */
@Entity({ name: 'training_plan_phases' })
@Index('training_plan_phases_position_uq', ['planId', 'position'], {
  unique: true,
})
export class TrainingPlanPhaseEntity extends BaseRecordEntity {
  @Column({ name: 'plan_id', type: 'uuid' })
  planId!: string;

  @ManyToOne(() => TrainingPlanEntity, (plan) => plan.phases, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'plan_id' })
  plan!: TrainingPlanEntity;

  @Column({ type: 'integer' })
  position!: number;

  @Column({ type: 'integer' })
  weeks!: number;

  @OneToMany(() => TrainingPlanSubjectEntity, (item) => item.phase)
  subjects!: TrainingPlanSubjectEntity[];
}

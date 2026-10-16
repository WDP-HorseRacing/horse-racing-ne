import { Column, Entity, JoinColumn, ManyToOne, OneToMany } from 'typeorm';
import { MutableRecordEntity } from '../../../common/database/base-record.entity';
import { UserEntity } from '../../users/entities/user.entity';
import { TrainingPlanPhaseEntity } from './training-plan-phase.entity';

/**
 * TrainingPlanEntity: giáo án của một Head Trainer, chia các giai đoạn theo thứ tự, mỗi giai đoạn có số tuần và các môn học kèm số buổi tối thiểu mỗi tuần; lớp tạo từ giáo án giữ một bản chép riêng.
 */
@Entity({ name: 'training_plans' })
export class TrainingPlanEntity extends MutableRecordEntity {
  @Column({ type: 'varchar', length: 160 })
  name!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({ name: 'head_trainer_id', type: 'uuid' })
  headTrainerId!: string;

  @ManyToOne(() => UserEntity, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'head_trainer_id' })
  headTrainer!: UserEntity;

  @OneToMany(() => TrainingPlanPhaseEntity, (phase) => phase.plan)
  phases!: TrainingPlanPhaseEntity[];
}

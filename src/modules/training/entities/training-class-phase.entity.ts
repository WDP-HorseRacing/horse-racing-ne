import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
} from 'typeorm';
import { BaseRecordEntity } from '../../../common/database/base-record.entity';
import { TrainingClassEntity } from './training-class.entity';
import { TrainingClassPhaseSubjectEntity } from './training-class-phase-subject.entity';

/**
 * TrainingClassPhaseEntity: một giai đoạn trong bản chép giáo án của lớp, kéo dài `weeks` tuần liên tiếp theo thứ tự `position`.
 */
@Entity({ name: 'training_class_phases' })
@Index('training_class_phases_position_uq', ['classId', 'position'], {
  unique: true,
})
export class TrainingClassPhaseEntity extends BaseRecordEntity {
  @Column({ name: 'class_id', type: 'uuid' })
  classId!: string;

  @ManyToOne(() => TrainingClassEntity, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({
    name: 'class_id',
    foreignKeyConstraintName: 'FK_training_class_phases_class',
  })
  trainingClass!: TrainingClassEntity;

  @Column({ type: 'integer' })
  position!: number;

  @Column({ type: 'integer' })
  weeks!: number;

  @OneToMany(() => TrainingClassPhaseSubjectEntity, (item) => item.phase)
  subjects!: TrainingClassPhaseSubjectEntity[];
}

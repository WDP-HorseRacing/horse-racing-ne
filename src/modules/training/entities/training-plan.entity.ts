import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { MutableRecordEntity } from '../../../common/database/base-record.entity';
import { HorseEntity } from '../../horses/entities/horse.entity';
import { UserEntity } from '../../users/entities/user.entity';
import { TrainingPlanStatus } from '../constants/training-plan-status.enum';

/**
 * TrainingPlanEntity: kế hoạch huấn luyện dài hạn cho một con ngựa.
 * Dùng để mô tả giai đoạn huấn luyện, mục tiêu và khoảng thời gian hiệu lực.
 */
@Entity({ name: 'training_plans' })
export class TrainingPlanEntity extends MutableRecordEntity {
  @Column({ name: 'horse_id', type: 'uuid' })
  horseId!: string;

  @ManyToOne(() => HorseEntity, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'horse_id' })
  horse!: HorseEntity;

  @Column({ name: 'created_by', type: 'uuid' })
  createdBy!: string;

  @ManyToOne(() => UserEntity, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'created_by' })
  creator!: UserEntity;

  @Column({ name: 'phase_name', type: 'varchar', length: 160 })
  phaseName!: string;

  @Column({ type: 'text' })
  goal!: string;

  @Column({ name: 'start_date', type: 'date' })
  startDate!: string;

  @Column({ name: 'end_date', type: 'date' })
  endDate!: string;

  @Column({
    type: 'varchar',
    length: 32,
    default: TrainingPlanStatus.SCHEDULED,
    enum: TrainingPlanStatus,
  })
  status!: TrainingPlanStatus;
}

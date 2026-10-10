import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseRecordEntity } from '../../../common/database/base-record.entity';
import { HorseEntity } from '../../horses/entities/horse.entity';
import { UserEntity } from '../../users/entities/user.entity';
import { CareTaskTypeEntity } from './care-task-type.entity';

/**
 * Việc riêng Head Trainer gắn cho một con ngựa trong một khoảng ngày
 */
@Entity({ name: 'horse_care_tasks' })
@Index('horse_care_tasks_horse_dates_idx', ['horseId', 'fromDate', 'toDate'])
@Check('horse_care_tasks_date_range_ck', '"from_date" <= "to_date"')
export class HorseCareTaskEntity extends BaseRecordEntity {
  @Column({ name: 'horse_id', type: 'uuid' })
  horseId!: string;

  @ManyToOne(() => HorseEntity, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({
    name: 'horse_id',
    foreignKeyConstraintName: 'horse_care_tasks_horse_fk',
  })
  horse!: HorseEntity;

  @Column({ name: 'task_type_id', type: 'uuid' })
  taskTypeId!: string;

  @ManyToOne(() => CareTaskTypeEntity, {
    nullable: false,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({
    name: 'task_type_id',
    foreignKeyConstraintName: 'horse_care_tasks_task_type_fk',
  })
  taskType!: CareTaskTypeEntity;

  @Column({ name: 'from_date', type: 'date' })
  fromDate!: string;

  @Column({ name: 'to_date', type: 'date' })
  toDate!: string;

  @Column({ type: 'varchar', length: 200, nullable: true })
  note!: string | null;

  @Column({ name: 'created_by', type: 'uuid' })
  createdBy!: string;

  @ManyToOne(() => UserEntity, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({
    name: 'created_by',
    foreignKeyConstraintName: 'horse_care_tasks_created_by_fk',
  })
  creator!: UserEntity;
}

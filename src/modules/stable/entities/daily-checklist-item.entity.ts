import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseRecordEntity } from '../../../common/database/base-record.entity';
import { UserEntity } from '../../users/entities/user.entity';
import { CareTaskTypeEntity } from './care-task-type.entity';
import { DailyChecklistEntity } from './daily-checklist.entity';

/**
 * Một việc trong checklist hằng ngày; doneAt khác null nghĩa là đã xong
 */
@Entity({ name: 'daily_checklist_items' })
@Index(
  'daily_checklist_items_checklist_type_uq',
  ['checklistId', 'taskTypeId'],
  {
    unique: true,
  },
)
export class DailyChecklistItemEntity extends BaseRecordEntity {
  @Column({ name: 'checklist_id', type: 'uuid' })
  checklistId!: string;

  @ManyToOne(() => DailyChecklistEntity, (checklist) => checklist.items, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({
    name: 'checklist_id',
    foreignKeyConstraintName: 'daily_checklist_items_checklist_fk',
  })
  checklist!: DailyChecklistEntity;

  @Column({ name: 'task_type_id', type: 'uuid' })
  taskTypeId!: string;

  @ManyToOne(() => CareTaskTypeEntity, {
    nullable: false,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({
    name: 'task_type_id',
    foreignKeyConstraintName: 'daily_checklist_items_task_type_fk',
  })
  taskType!: CareTaskTypeEntity;

  @Column({ type: 'smallint' })
  position!: number;

  @Column({ name: 'done_at', type: 'timestamptz', nullable: true })
  doneAt!: Date | null;

  @Column({ name: 'done_by', type: 'uuid', nullable: true })
  doneBy!: string | null;

  @ManyToOne(() => UserEntity, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({
    name: 'done_by',
    foreignKeyConstraintName: 'daily_checklist_items_done_by_fk',
  })
  doer!: UserEntity | null;

  @Column({ type: 'varchar', length: 200, nullable: true })
  note!: string | null;
}

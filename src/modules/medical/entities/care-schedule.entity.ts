import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { MutableRecordEntity } from '../../../common/database/base-record.entity';
import { HorseEntity } from '../../horses/entities/horse.entity';
import { UserEntity } from '../../users/entities/user.entity';
import {
  CareScheduleStatus,
  CareScheduleType,
} from '../constants/care-schedule.enum';

/**
 * CareScheduleEntity: lịch chăm sóc / điều trị định kỳ cho ngựa.
 * Dùng để lên lịch công việc y tế, chăm sóc hoặc kiểm tra sức khỏe.
 */
@Entity({ name: 'care_schedules' })
export class CareScheduleEntity extends MutableRecordEntity {
  @Column({ name: 'horse_id', type: 'uuid' })
  horseId!: string;

  @ManyToOne(() => HorseEntity, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'horse_id' })
  horse!: HorseEntity;

  @Column({ type: 'varchar', length: 32 })
  type!: CareScheduleType;

  @Column({ name: 'due_at', type: 'timestamptz' })
  dueAt!: Date;

  @Column({ name: 'assigned_to', type: 'uuid', nullable: true })
  assignedTo!: string | null;

  @ManyToOne(() => UserEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'assigned_to' })
  assignee!: UserEntity | null;

  @Column({
    type: 'varchar',
    length: 32,
    default: CareScheduleStatus.SCHEDULED,
  })
  status!: CareScheduleStatus;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt!: Date | null;

  @Column({ type: 'text', nullable: true })
  notes!: string | null;
}

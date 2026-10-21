import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { MutableRecordEntity } from '../../../common/database/base-record.entity';
import { HorseEntity } from '../../horses/entities/horse.entity';
import { UserEntity } from '../../users/entities/user.entity';
import { MedicalCaseEntity } from './medical-case.entity';
import { MedicalRecordEntity } from './medical-record.entity';
import {
  CareAssigneeType,
  CareScheduleStatus,
  CareScheduleType,
} from '../constants/care-schedule.enum';

/**
 * CareScheduleEntity: lịch chăm sóc / điều trị định kỳ cho ngựa.
 * Dùng để lên lịch công việc y tế, chăm sóc hoặc kiểm tra sức khỏe.
 * Loại ROUTINE_CHECKUP là ngày hẹn khám định kỳ: mỗi ngựa tối đa một lịch hẹn SCHEDULED.
 * Loại FOLLOW_UP là ngày hẹn tái khám do một buổi khám trong bệnh án đặt: caseId, recordId bắt buộc, mỗi buổi khám tối đa một lịch.
 */
@Entity({ name: 'care_schedules' })
@Index('care_schedules_active_checkup_uq', ['horseId'], {
  unique: true,
  where: `type = '${CareScheduleType.ROUTINE_CHECKUP}' AND status = '${CareScheduleStatus.SCHEDULED}'`,
})
@Index('care_schedules_record_uq', ['recordId'], {
  unique: true,
  where: 'record_id IS NOT NULL',
})
@Check(
  'care_schedules_follow_up_ck',
  `type <> '${CareScheduleType.FOLLOW_UP}' OR (case_id IS NOT NULL AND record_id IS NOT NULL)`,
)
@Check(
  'care_schedules_assignee_ck',
  `(assignee_type IS NULL AND assigned_to IS NULL) OR assignee_type = '${CareAssigneeType.GROOM}' OR (assignee_type = '${CareAssigneeType.VET}' AND assigned_to IS NOT NULL)`,
)
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

  @Column({
    name: 'assignee_type',
    type: 'varchar',
    length: 16,
    nullable: true,
  })
  assigneeType!: CareAssigneeType | null;

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

  @Column({ name: 'completed_by', type: 'uuid', nullable: true })
  completedBy!: string | null;

  @ManyToOne(() => UserEntity, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'completed_by' })
  completer!: UserEntity | null;

  @Column({ name: 'completed_record_id', type: 'uuid', nullable: true })
  completedRecordId!: string | null;

  @ManyToOne(() => MedicalRecordEntity, {
    nullable: true,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({
    name: 'completed_record_id',
    foreignKeyConstraintName: 'care_schedules_completed_record_fk',
  })
  completedRecord!: MedicalRecordEntity | null;

  @Column({ name: 'cancel_reason', type: 'text', nullable: true })
  cancelReason!: string | null;

  @Column({ type: 'text', nullable: true })
  notes!: string | null;

  @Column({ name: 'case_id', type: 'uuid', nullable: true })
  caseId!: string | null;

  @ManyToOne(() => MedicalCaseEntity, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({
    name: 'case_id',
    foreignKeyConstraintName: 'care_schedules_case_fk',
  })
  medicalCase!: MedicalCaseEntity | null;

  @Column({ name: 'record_id', type: 'uuid', nullable: true })
  recordId!: string | null;

  @ManyToOne(() => MedicalRecordEntity, {
    nullable: true,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({
    name: 'record_id',
    foreignKeyConstraintName: 'care_schedules_record_fk',
  })
  record!: MedicalRecordEntity | null;
}

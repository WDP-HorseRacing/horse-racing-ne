import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseRecordEntity } from '../../../common/database/base-record.entity';
import { HorseEntity } from '../../horses/entities/horse.entity';
import { HorseHealthStatus } from '../../horses/enums/horse-status.enum';
import { UserEntity } from '../../users/entities/user.entity';
import { MedicalSeverity } from '../constants/medical-record.enum';
import {
  MedicalVisitConclusion,
  MedicalVisitKind,
} from '../constants/medical-visit.enum';
import { MedicalCaseEntity } from './medical-case.entity';

/**
 * MedicalRecordEntity: một buổi khám của ngựa (Flow 3 mục III.1).
 * Buổi khám ngoài bệnh án có caseId null (trừ buổi mở bệnh án); buổi tái khám luôn thuộc một bệnh án.
 * Không sửa, không xóa; ghi sai thì hủy bằng voidedAt và voidReason.
 */
@Entity({ name: 'medical_records' })
@Index('medical_records_horse_exam_idx', ['horseId', 'examDate'])
@Index('medical_records_case_idx', ['caseId'])
export class MedicalRecordEntity extends BaseRecordEntity {
  @Column({ name: 'horse_id', type: 'uuid' })
  horseId!: string;

  @ManyToOne(() => HorseEntity, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'horse_id' })
  horse!: HorseEntity;

  @Column({ name: 'vet_id', type: 'uuid' })
  vetId!: string;

  @ManyToOne(() => UserEntity, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'vet_id' })
  vet!: UserEntity;

  @Column({ name: 'exam_date', type: 'timestamptz' })
  examDate!: Date;

  @Column({ type: 'text', nullable: true })
  diagnosis!: string | null;

  @Column({ type: 'varchar', length: 32, nullable: true })
  severity!: MedicalSeverity | null;

  @Column({ name: 'resulting_status', type: 'varchar', length: 32 })
  resultingStatus!: HorseHealthStatus;

  @Column({ name: 'case_id', type: 'uuid', nullable: true })
  caseId!: string | null;

  @ManyToOne(() => MedicalCaseEntity, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'case_id' })
  medicalCase!: MedicalCaseEntity | null;

  @Column({ type: 'varchar', length: 16 })
  kind!: MedicalVisitKind;

  @Column({ type: 'varchar', length: 16, nullable: true })
  conclusion!: MedicalVisitConclusion | null;

  @Column({ name: 'next_visit_at', type: 'timestamptz', nullable: true })
  nextVisitAt!: Date | null;

  @Column({ name: 'care_instructions', type: 'text', nullable: true })
  careInstructions!: string | null;

  @Column({ name: 'voided_at', type: 'timestamptz', nullable: true })
  voidedAt!: Date | null;

  @Column({ name: 'void_reason', type: 'text', nullable: true })
  voidReason!: string | null;

  @Column({ name: 'replaces_record_id', type: 'uuid', nullable: true })
  replacesRecordId!: string | null;

  @ManyToOne(() => MedicalRecordEntity, {
    nullable: true,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'replaces_record_id' })
  replacedRecord!: MedicalRecordEntity | null;
}

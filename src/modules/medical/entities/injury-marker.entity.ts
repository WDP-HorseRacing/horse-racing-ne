import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseRecordEntity } from '../../../common/database/base-record.entity';
import { MedicalRecordEntity } from './medical-record.entity';

@Entity({ name: 'injury_markers' })
@Index('injury_markers_case_created_idx', ['injuryCaseId', 'createdAt'])
@Index('injury_markers_medical_record_idx', ['medicalRecordId'])
export class InjuryMarkerEntity extends BaseRecordEntity {
  @Column({ name: 'medical_record_id', type: 'uuid' })
  medicalRecordId!: string;

  @ManyToOne(() => MedicalRecordEntity, {
    nullable: false,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'medical_record_id' })
  medicalRecord!: MedicalRecordEntity;

  @Column({ name: 'injury_case_id', type: 'uuid' })
  injuryCaseId!: string;

  @Column({ name: 'body_region', type: 'varchar', length: 80 })
  bodyRegion!: string;

  @Column({ name: 'injury_type', type: 'varchar', length: 100 })
  injuryType!: string;

  @Column({ name: 'recovery_status', type: 'varchar', length: 32 })
  recoveryStatus!: string;

  @Column({ type: 'text', nullable: true })
  notes!: string | null;
}

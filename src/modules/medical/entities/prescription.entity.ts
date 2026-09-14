import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseRecordEntity } from '../../../common/database/base-record.entity';
import { MedicalRecordEntity } from './medical-record.entity';

@Entity({ name: 'prescriptions' })
@Index('prescriptions_medical_record_idx', ['medicalRecordId'])
export class PrescriptionEntity extends BaseRecordEntity {
  @Column({ name: 'medical_record_id', type: 'uuid' })
  medicalRecordId!: string;

  @ManyToOne(() => MedicalRecordEntity, {
    nullable: false,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'medical_record_id' })
  medicalRecord!: MedicalRecordEntity;

  @Column({ type: 'varchar', length: 160 })
  medicine!: string;

  @Column({ type: 'varchar', length: 160 })
  dosage!: string;

  @Column({ type: 'varchar', length: 160 })
  frequency!: string;

  @Column({ name: 'start_date', type: 'date' })
  startDate!: string;

  @Column({ name: 'end_date', type: 'date', nullable: true })
  endDate!: string | null;
}

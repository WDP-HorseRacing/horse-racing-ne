import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseRecordEntity } from '../../../common/database/base-record.entity';
import { MedicalRecordEntity } from './medical-record.entity';
import { RecoveryStatus } from '../constants/injury-marker.enum';
import { InjuryEntity } from './injury.entity';

/**
 * InjuryMarkerEntity: mức hồi phục của một chấn thương ghi nhận tại một buổi khám.
 */
@Entity({ name: 'injury_markers' })
@Index('injury_markers_injury_idx', ['injuryId'])
@Index('injury_markers_record_injury_uq', ['medicalRecordId', 'injuryId'], {
  unique: true,
})
export class InjuryMarkerEntity extends BaseRecordEntity {
  @Column({ name: 'medical_record_id', type: 'uuid' })
  medicalRecordId!: string;

  @ManyToOne(() => MedicalRecordEntity, {
    nullable: false,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'medical_record_id' })
  medicalRecord!: MedicalRecordEntity;

  @Column({ name: 'injury_id', type: 'uuid' })
  injuryId!: string;

  @ManyToOne(() => InjuryEntity, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'injury_id' })
  injury!: InjuryEntity;

  @Column({ name: 'recovery_status', type: 'varchar', length: 32 })
  recoveryStatus!: RecoveryStatus;

  @Column({ type: 'text', nullable: true })
  notes!: string | null;
}

import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { BaseRecordEntity } from '../../../common/database/base-record.entity';
import { MedicalRecordEntity } from './medical-record.entity';
import {
  InjuryBodyRegion,
  InjuryPosition,
  InjuryType,
  RecoveryStatus,
} from '../constants/injury-marker.enum';

/**
 * InjuryMarkerEntity: chi tiết chấn thương được ghi trên một medical record.
 * Dùng để mô tả vị trí, loại thương tích và tiến độ hồi phục.
 */
@Entity({ name: 'injury_markers' })
export class InjuryMarkerEntity extends BaseRecordEntity {
  @Column({ name: 'medical_record_id', type: 'uuid' })
  medicalRecordId!: string;

  @ManyToOne(() => MedicalRecordEntity, {
    nullable: false,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'medical_record_id' })
  medicalRecord!: MedicalRecordEntity;

  @Column({ name: 'body_region', type: 'varchar', length: 80 })
  bodyRegion!: InjuryBodyRegion;

  @Column({ type: 'jsonb', nullable: true })
  position!: InjuryPosition | null;

  @Column({ name: 'injury_type', type: 'varchar', length: 100 })
  injuryType!: InjuryType;

  @Column({ name: 'recovery_status', type: 'varchar', length: 32 })
  recoveryStatus!: RecoveryStatus;

  @Column({ type: 'text', nullable: true })
  notes!: string | null;
}

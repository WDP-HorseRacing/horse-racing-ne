import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { MutableRecordEntity } from '../../../common/database/base-record.entity';
import { HorseEntity } from '../../horses/entities/horse.entity';
import { HorseMeasurementAlert } from '../../horses/enums/horse-measurement-alert.enum';
import { IncidentEntity } from '../../stable/entities/incident.entity';
import { UserEntity } from '../../users/entities/user.entity';
import {
  ExamRequestSource,
  ExamRequestStatus,
} from '../constants/exam-request.enum';
import { MedicalRecordEntity } from './medical-record.entity';

/**
 * MedicalExamRequestEntity: yêu cầu khám khi ngựa có vấn đề, hàng đợi của bác sĩ.
 *
 * - requestedBy null khi hệ thống tự sinh từ cảnh báo chỉ số (source MEASUREMENT_ALERT)
 * - alertType chỉ có với yêu cầu tự động, dùng để chặn trùng: mỗi ngựa một yêu cầu PENDING cho mỗi loại cảnh báo
 */
@Entity({ name: 'medical_exam_requests' })
@Index('medical_exam_requests_horse_status_idx', ['horseId', 'status'])
@Index('medical_exam_requests_pending_alert_uq', ['horseId', 'alertType'], {
  unique: true,
  where: `status = '${ExamRequestStatus.PENDING}' AND alert_type IS NOT NULL`,
})
export class MedicalExamRequestEntity extends MutableRecordEntity {
  @Column({ name: 'horse_id', type: 'uuid' })
  horseId!: string;

  @ManyToOne(() => HorseEntity, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'horse_id' })
  horse!: HorseEntity;

  @Column({ name: 'requested_by', type: 'uuid', nullable: true })
  requestedBy!: string | null;

  @ManyToOne(() => UserEntity, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'requested_by' })
  requester!: UserEntity | null;

  @Column({ type: 'varchar', length: 24 })
  source!: ExamRequestSource;

  @Column({ type: 'boolean', default: false })
  urgent!: boolean;

  @Column({ type: 'text' })
  description!: string;

  @Column({ type: 'varchar', length: 16, default: ExamRequestStatus.PENDING })
  status!: ExamRequestStatus;

  @Column({ name: 'dismiss_reason', type: 'text', nullable: true })
  dismissReason!: string | null;

  @Column({ name: 'handled_by', type: 'uuid', nullable: true })
  handledBy!: string | null;

  @ManyToOne(() => UserEntity, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'handled_by' })
  handler!: UserEntity | null;

  @Column({ name: 'handled_at', type: 'timestamptz', nullable: true })
  handledAt!: Date | null;

  @Column({ name: 'medical_record_id', type: 'uuid', nullable: true })
  medicalRecordId!: string | null;

  @ManyToOne(() => MedicalRecordEntity, {
    nullable: true,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'medical_record_id' })
  medicalRecord!: MedicalRecordEntity | null;

  @Column({ name: 'incident_id', type: 'uuid', nullable: true })
  incidentId!: string | null;

  @ManyToOne(() => IncidentEntity, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'incident_id' })
  incident!: IncidentEntity | null;

  @Column({ name: 'alert_type', type: 'varchar', length: 16, nullable: true })
  alertType!: HorseMeasurementAlert | null;
}

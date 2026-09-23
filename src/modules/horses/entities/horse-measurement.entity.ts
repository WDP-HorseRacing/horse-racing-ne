import {
  Column,
  DeleteDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
} from 'typeorm';
import { BaseRecordEntity } from '../../../common/database/base-record.entity';
import { MedicalRecordEntity } from '../../medical/entities/medical-record.entity';
import { UserEntity } from '../../users/entities/user.entity';
import { HorseMeasurementSource } from '../enums/horse-measurement-source.enum';
import { HorseMeasurementType } from '../enums/horse-measurement-type.enum';
import { HorseEntity } from './horse.entity';

@Entity({ name: 'horse_measurements' })
@Index('horse_measurements_horse_type_measured_idx', [
  'horseId',
  'type',
  'measuredAt',
])
export class HorseMeasurementEntity extends BaseRecordEntity {
  @Column({ name: 'horse_id', type: 'uuid' })
  horseId!: string;

  @ManyToOne(() => HorseEntity, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'horse_id' })
  horse!: HorseEntity;

  @Column({ type: 'varchar', length: 32 })
  type!: HorseMeasurementType;

  @Column({ type: 'numeric', precision: 7, scale: 2 })
  value!: string;

  @Column({ name: 'measured_at', type: 'timestamptz' })
  measuredAt!: Date;

  @Column({ name: 'measured_by', type: 'uuid' })
  measuredBy!: string;

  @ManyToOne(() => UserEntity, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'measured_by' })
  measurer!: UserEntity;

  @Column({
    type: 'varchar',
    length: 16,
    default: HorseMeasurementSource.MANUAL,
  })
  source!: HorseMeasurementSource;

  @Column({ name: 'medical_record_id', type: 'uuid', nullable: true })
  medicalRecordId!: string | null;

  @ManyToOne(() => MedicalRecordEntity, {
    nullable: true,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({
    name: 'medical_record_id',
    foreignKeyConstraintName: 'horse_measurements_medical_record_fk',
  })
  medicalRecord!: MedicalRecordEntity | null;

  @Column({ name: 'delete_reason', type: 'text', nullable: true })
  deleteReason!: string | null;

  @Column({ name: 'deleted_by', type: 'uuid', nullable: true })
  deletedBy!: string | null;

  @ManyToOne(() => UserEntity, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({
    name: 'deleted_by',
    foreignKeyConstraintName: 'horse_measurements_deleted_by_fk',
  })
  deleter!: UserEntity | null;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt!: Date | null;
}

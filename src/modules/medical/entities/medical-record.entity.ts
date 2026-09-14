import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseRecordEntity } from '../../../common/database/base-record.entity';
import { HorseEntity } from '../../horses/entities/horse.entity';
import { UserEntity } from '../../users/entities/user.entity';

@Entity({ name: 'medical_records' })
@Index('medical_records_horse_exam_idx', ['horseId', 'examDate'])
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

  @Column({ type: 'text' })
  diagnosis!: string;

  @Column({ type: 'varchar', length: 32 })
  severity!: string;

  @Column({ name: 'resulting_status', type: 'varchar', length: 32 })
  resultingStatus!: string;

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

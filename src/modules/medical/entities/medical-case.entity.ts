import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { MutableRecordEntity } from '../../../common/database/base-record.entity';
import { HorseEntity } from '../../horses/entities/horse.entity';
import { UserEntity } from '../../users/entities/user.entity';
import { MedicalCaseStatus } from '../constants/medical-case.enum';

/**
 * MedicalCaseEntity: bệnh án, nơi gom nhiều buổi khám của cùng một vấn đề.
 * Mỗi con ngựa có tối đa một bệnh án OPEN; kết luận cuối và chi phí chỉ có khi CLOSED.
 */
@Entity({ name: 'medical_cases' })
@Check('medical_cases_total_cost_chk', '"total_cost" >= 0')
@Index('medical_cases_open_horse_uq', ['horseId'], {
  unique: true,
  where: `status = '${MedicalCaseStatus.OPEN}'`,
})
export class MedicalCaseEntity extends MutableRecordEntity {
  @Column({ name: 'horse_id', type: 'uuid' })
  horseId!: string;

  @ManyToOne(() => HorseEntity, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'horse_id' })
  horse!: HorseEntity;

  @Column({ name: 'opened_at', type: 'timestamptz' })
  openedAt!: Date;

  @Column({ name: 'opened_by', type: 'uuid' })
  openedBy!: string;

  @ManyToOne(() => UserEntity, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'opened_by' })
  opener!: UserEntity;

  @Column({ name: 'initial_diagnosis', type: 'text' })
  initialDiagnosis!: string;

  @Column({ type: 'varchar', length: 16, default: MedicalCaseStatus.OPEN })
  status!: MedicalCaseStatus;

  @Column({ name: 'closed_at', type: 'timestamptz', nullable: true })
  closedAt!: Date | null;

  @Column({ name: 'closed_by', type: 'uuid', nullable: true })
  closedBy!: string | null;

  @ManyToOne(() => UserEntity, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'closed_by' })
  closer!: UserEntity | null;

  @Column({ name: 'final_conclusion', type: 'text', nullable: true })
  finalConclusion!: string | null;

  @Column({ name: 'total_cost', type: 'bigint', nullable: true })
  totalCost!: string | null;
}

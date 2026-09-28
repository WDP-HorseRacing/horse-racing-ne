import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { MutableRecordEntity } from '../../../common/database/base-record.entity';
import { HorseEntity } from '../../horses/entities/horse.entity';
import { HorseEnrollmentStatus } from '../enums/horse-enrollment-status.enum';
import { TrainingClassEntity } from './training-class.entity';

@Entity({ name: 'horse_enrollments' })
@Index('horse_enrollments_active_uq', ['classId', 'horseId'], {
  unique: true,
  where: `status = '${HorseEnrollmentStatus.ACTIVE}'`,
})
export class HorseEnrollmentEntity extends MutableRecordEntity {
  @Column({ name: 'class_id', type: 'uuid' })
  classId!: string;

  @ManyToOne(() => TrainingClassEntity, {
    nullable: false,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'class_id' })
  trainingClass!: TrainingClassEntity;

  @Column({ name: 'horse_id', type: 'uuid' })
  horseId!: string;

  @ManyToOne(() => HorseEntity, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'horse_id' })
  horse!: HorseEntity;

  @Column({ name: 'enrolled_at', type: 'timestamptz' })
  enrolledAt!: Date;

  @Column({ name: 'left_at', type: 'timestamptz', nullable: true })
  leftAt!: Date | null;

  @Column({
    type: 'varchar',
    length: 32,
    default: HorseEnrollmentStatus.ACTIVE,
    enum: HorseEnrollmentStatus,
  })
  status!: HorseEnrollmentStatus;
}

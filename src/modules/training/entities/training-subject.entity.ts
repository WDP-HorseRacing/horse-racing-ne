import { Check, Column, Entity, Index } from 'typeorm';
import { MutableRecordEntity } from '../../../common/database/base-record.entity';
import { TrainingIntensity } from '../enums/training-intensity.enum';
import { TrainingSessionType } from '../enums/training-session-type.enum';

/**
 * TrainingSubjectEntity: một môn học là một bài tập cố định (loại buổi, cường độ, cự ly, thời lượng, mặt sân), dùng chung toàn CLB.
 */
@Entity({ name: 'training_subjects' })
@Index('training_subjects_name_uq', ['name'], { unique: true })
@Check(
  'training_subjects_duration_minutes_ck',
  '"duration_minutes" BETWEEN 15 AND 480',
)
export class TrainingSubjectEntity extends MutableRecordEntity {
  @Column({ type: 'varchar', length: 160 })
  name!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({
    name: 'session_type',
    type: 'varchar',
    length: 32,
    enum: TrainingSessionType,
  })
  sessionType!: TrainingSessionType;

  @Column({ type: 'varchar', length: 32, enum: TrainingIntensity })
  intensity!: TrainingIntensity;

  @Column({ name: 'planned_distance_m', type: 'integer' })
  plannedDistanceM!: number;

  @Column({ name: 'duration_minutes', type: 'integer', default: 60 })
  durationMinutes!: number;

  @Column({ type: 'varchar', length: 80, nullable: true })
  surface!: string | null;

  @Column({ name: 'target_time_ms', type: 'integer', nullable: true })
  targetTimeMs!: number | null;
}

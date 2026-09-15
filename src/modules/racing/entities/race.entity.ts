import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { MutableRecordEntity } from '../../../common/database/base-record.entity';
import { ClubEntity } from '../../users/entities/club.entity';
import { RaceStatus } from '../constants/race-status.enum';

/**
 * RaceEntity: một cuộc đua hoặc sự kiện thi đấu được lên kế hoạch cho club.
 * Dùng để mô tả thông tin chung của cuộc đua, điều kiện và trạng thái triển khai.
 */
@Entity({ name: 'races' })
export class RaceEntity extends MutableRecordEntity {
  @Column({ name: 'club_id', type: 'uuid' })
  clubId!: string;

  @ManyToOne(() => ClubEntity, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'club_id' })
  club!: ClubEntity;

  @Column({ type: 'varchar', length: 200 })
  name!: string;

  @Column({ name: 'scheduled_at', type: 'timestamptz' })
  scheduledAt!: Date;

  @Column({ name: 'distance_meters', type: 'integer', nullable: true })
  distanceMeters!: number | null;

  @Column({ name: 'surface', type: 'varchar', length: 32, nullable: true })
  surface!: string | null;

  @Column({ name: 'race_class', type: 'varchar', length: 80, nullable: true })
  raceClass!: string | null;

  @Column({ name: 'max_participants', type: 'smallint', nullable: true })
  maxParticipants!: number | null;

  @Column({ type: 'jsonb', nullable: true })
  conditions!: Record<string, unknown> | null;

  @Column({
    type: 'varchar',
    length: 32,
    default: RaceStatus.PLANNED,
    enum: RaceStatus,
  })
  status!: RaceStatus;
}

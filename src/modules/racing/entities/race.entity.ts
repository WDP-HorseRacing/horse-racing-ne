import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { MutableRecordEntity } from '../../../common/database/base-record.entity';
import { ClubEntity } from '../../users/entities/club.entity';

@Entity({ name: 'races' })
@Index('races_club_schedule_idx', ['clubId', 'scheduledAt'])
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

  @Column({ type: 'jsonb', nullable: true })
  conditions!: Record<string, unknown> | null;

  @Column({ type: 'varchar', length: 32, default: 'PLANNED' })
  status!: string;
}

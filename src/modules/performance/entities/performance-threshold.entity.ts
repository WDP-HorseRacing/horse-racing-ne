import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { MutableRecordEntity } from '../../../common/database/base-record.entity';
import { HorseEntity } from '../../horses/entities/horse.entity';
import { ClubEntity } from '../../users/entities/club.entity';

/**
 * PerformanceThresholdEntity: ngưỡng hiệu suất áp dụng cho club hoặc từng con ngựa.
 * Dùng để lưu các giới hạn kỹ thuật và thời điểm hiệu lực của chúng.
 */
@Entity({ name: 'performance_thresholds' })
export class PerformanceThresholdEntity extends MutableRecordEntity {
  @Column({ name: 'club_id', type: 'uuid' })
  clubId!: string;

  @ManyToOne(() => ClubEntity, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'club_id' })
  club!: ClubEntity;

  @Column({ name: 'horse_id', type: 'uuid', nullable: true })
  horseId!: string | null;

  @ManyToOne(() => HorseEntity, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'horse_id' })
  horse!: HorseEntity | null;

  @Column({ name: 'profile_name', type: 'varchar', length: 100 })
  profileName!: string;

  @Column({ name: 'rule_version', type: 'integer' })
  ruleVersion!: number;

  @Column({ name: 'effective_from', type: 'timestamptz' })
  effectiveFrom!: Date;

  @Column({ name: 'effective_to', type: 'timestamptz', nullable: true })
  effectiveTo!: Date | null;

  @Column({ type: 'jsonb' })
  limits!: Record<string, number>;
}

import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { SoftDeletableRecordEntity } from '../../../common/database/base-record.entity';
import { MediaAssetEntity } from '../../media/entities/media-asset.entity';
import { ClubEntity } from '../../users/entities/club.entity';
import { HorseGender } from '../constants/horse-gender.enum';
import {
  HorseHealthStatus,
  HorseLifecycleStatus,
} from '../constants/horse-status.enum';
import { RaceAptitude } from '../constants/race-aptitude.enum';

@Entity({ name: 'horses' })
@Index('horses_club_status_idx', ['clubId', 'lifecycleStatus', 'healthStatus'])
@Index('horses_club_microchip_uq', ['clubId', 'microchipId'], {
  unique: true,
  where: 'microchip_id IS NOT NULL AND deleted_at IS NULL',
})
export class HorseEntity extends SoftDeletableRecordEntity {
  @Column({ name: 'club_id', type: 'uuid' })
  clubId!: string;

  @ManyToOne(() => ClubEntity, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'club_id' })
  club!: ClubEntity;

  @Column({ type: 'varchar', length: 160 })
  name!: string;

  @Column({ type: 'varchar', length: 16, nullable: true })
  gender!: HorseGender | null;

  @Column({ type: 'varchar', length: 80, nullable: true })
  breed!: string | null;

  @Column({ type: 'varchar', length: 40, nullable: true })
  color!: string | null;

  @Column({
    name: 'race_aptitude',
    type: 'varchar',
    length: 16,
    nullable: true,
  })
  raceAptitude!: RaceAptitude | null;

  @Column({ name: 'is_reference', type: 'boolean', default: false })
  isReference!: boolean;

  @Column({ name: 'date_of_birth', type: 'date', nullable: true })
  dateOfBirth!: string | null;

  @Column({ name: 'microchip_id', type: 'varchar', length: 80, nullable: true })
  microchipId!: string | null;

  @Column({ name: 'photo_asset_id', type: 'uuid', nullable: true })
  mediaId!: string | null;

  @ManyToOne(() => MediaAssetEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'photo_asset_id' })
  media!: MediaAssetEntity | null;

  @Column({ name: 'sire_id', type: 'uuid', nullable: true })
  sireId!: string | null;

  @ManyToOne(() => HorseEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'sire_id' })
  sire!: HorseEntity | null;

  @Column({ name: 'dam_id', type: 'uuid', nullable: true })
  damId!: string | null;

  @ManyToOne(() => HorseEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'dam_id' })
  dam!: HorseEntity | null;

  @Column({
    name: 'health_status',
    type: 'varchar',
    length: 32,
    default: HorseHealthStatus.ELIGIBLE,
  })
  healthStatus!: HorseHealthStatus;

  @Column({
    name: 'lifecycle_status',
    type: 'varchar',
    length: 32,
    default: HorseLifecycleStatus.ACTIVE,
  })
  lifecycleStatus!: HorseLifecycleStatus;
}

import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { SoftDeletableRecordEntity } from '../../../common/database/base-record.entity';
import { ClubEntity } from '../../users/entities/club.entity';
import { MediaAssetEntity } from '../../media/entities/media-asset.entity';

@Entity({ name: 'horses' })
@Index('horses_club_microchip_uq', ['clubId', 'microchipId'], {
  unique: true,
  where: 'microchip_id IS NOT NULL AND deleted_at IS NULL',
})
@Index('horses_club_status_idx', ['clubId', 'lifecycleStatus', 'healthStatus'])
export class HorseEntity extends SoftDeletableRecordEntity {
  @Column({ name: 'club_id', type: 'uuid' })
  clubId!: string;

  @ManyToOne(() => ClubEntity, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'club_id' })
  club!: ClubEntity;

  @Column({ type: 'varchar', length: 160 })
  name!: string;

  @Column({ name: 'date_of_birth', type: 'date', nullable: true })
  dateOfBirth!: string | null;

  @Column({ name: 'microchip_id', type: 'varchar', length: 80, nullable: true })
  microchipId!: string | null;

  @Column({ name: 'photo_asset_id', type: 'uuid', nullable: true })
  photoAssetId!: string | null;

  @ManyToOne(() => MediaAssetEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'photo_asset_id' })
  photoAsset!: MediaAssetEntity | null;

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
    default: 'ELIGIBLE',
  })
  healthStatus!: string;

  @Column({
    name: 'lifecycle_status',
    type: 'varchar',
    length: 32,
    default: 'ACTIVE',
  })
  lifecycleStatus!: string;
}

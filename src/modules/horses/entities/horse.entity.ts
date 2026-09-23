import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { SoftDeletableRecordEntity } from '../../../common/database/base-record.entity';
import { MediaAssetEntity } from '../../media/entities/media-asset.entity';
import { BarnEntity } from '../../stable/entities/barn.entity';
import { UserEntity } from '../../users/entities/user.entity';
import { HorseGender } from '../enums/horse-gender.enum';
import {
  HorseHealthStatus,
  HorseLifecycleStatus,
} from '../enums/horse-status.enum';
import { RaceAptitude } from '../enums/race-aptitude.enum';

@Entity({ name: 'horses' })
@Index('horses_microchip_uq', ['microchipId'], {
  unique: true,
  where: 'microchip_id IS NOT NULL',
})
@Index('horses_owner_idx', ['ownerId'], { where: 'deleted_at IS NULL' })
@Index('horses_barn_idx', ['barnId'], { where: 'deleted_at IS NULL' })
export class HorseEntity extends SoftDeletableRecordEntity {
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

  @Column({ name: 'date_of_birth', type: 'date', nullable: true })
  dateOfBirth!: string | null;

  @Column({ name: 'microchip_id', type: 'varchar', length: 80, nullable: true })
  microchipId!: string | null;

  @Column({ name: 'photo_asset_id', type: 'uuid', nullable: true })
  mediaId!: string | null;

  @ManyToOne(() => MediaAssetEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'photo_asset_id' })
  media!: MediaAssetEntity | null;

  @Column({ name: 'owner_id', type: 'uuid', nullable: true })
  ownerId!: string | null;

  @ManyToOne(() => UserEntity, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'owner_id', foreignKeyConstraintName: 'horses_owner_fk' })
  owner!: UserEntity | null;

  @Column({ name: 'barn_id', type: 'uuid', nullable: true })
  barnId!: string | null;

  @ManyToOne(() => BarnEntity, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'barn_id', foreignKeyConstraintName: 'horses_barn_fk' })
  barn!: BarnEntity | null;

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

  @Column({ name: 'lifecycle_reason', type: 'text', nullable: true })
  lifecycleReason!: string | null;

  @Column({
    name: 'lifecycle_changed_at',
    type: 'timestamptz',
    nullable: true,
  })
  lifecycleChangedAt!: Date | null;

  @Column({ name: 'deleted_reason', type: 'text', nullable: true })
  deletedReason!: string | null;
}

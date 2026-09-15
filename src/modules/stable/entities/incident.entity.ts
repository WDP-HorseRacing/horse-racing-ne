import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { MutableRecordEntity } from '../../../common/database/base-record.entity';
import { HorseEntity } from '../../horses/entities/horse.entity';
import { UserEntity } from '../../users/entities/user.entity';
import { MediaAssetEntity } from '../../media/entities/media-asset.entity';
import { IncidentStatus } from '../constants/incident-status.enum';

/**
 * IncidentEntity: lưu các sự cố / bất thường xảy ra với ngựa.
 * Dùng để báo cáo, ưu tiên xử lý, đính kèm hình ảnh và theo dõi trạng thái giải quyết.
 */
@Entity({ name: 'incidents' })
export class IncidentEntity extends MutableRecordEntity {
  @Column({ name: 'horse_id', type: 'uuid' })
  horseId!: string;

  @ManyToOne(() => HorseEntity, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'horse_id' })
  horse!: HorseEntity;

  @Column({ name: 'reported_by', type: 'uuid' })
  reportedBy!: string;

  @ManyToOne(() => UserEntity, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'reported_by' })
  reporter!: UserEntity;

  @Column({ type: 'text' })
  description!: string;

  @Column({ type: 'boolean', default: false })
  urgent!: boolean;

  @Column({ name: 'media_asset_id', type: 'uuid', nullable: true })
  mediaAssetId!: string | null;

  @ManyToOne(() => MediaAssetEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'media_asset_id' })
  mediaAsset!: MediaAssetEntity | null;

  @Column({
    type: 'varchar',
    length: 32,
    default: IncidentStatus.OPEN,
    enum: IncidentStatus,
  })
  status!: IncidentStatus;
}

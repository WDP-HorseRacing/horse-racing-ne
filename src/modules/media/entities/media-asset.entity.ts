import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseRecordEntity } from '../../../common/database/base-record.entity';
import { ClubEntity } from '../../users/entities/club.entity';
import { UserEntity } from '../../users/entities/user.entity';

@Entity({ name: 'media_assets' })
@Index('media_assets_provider_key_uq', ['storageProvider', 'objectKey'], {
  unique: true,
})
export class MediaAssetEntity extends BaseRecordEntity {
  @Column({ name: 'club_id', type: 'uuid' })
  clubId!: string;

  @ManyToOne(() => ClubEntity, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'club_id' })
  club!: ClubEntity;

  @Column({ name: 'uploaded_by', type: 'uuid' })
  uploadedBy!: string;

  @ManyToOne(() => UserEntity, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'uploaded_by' })
  uploader!: UserEntity;

  @Column({ name: 'storage_provider', type: 'varchar', length: 40 })
  storageProvider!: string;

  @Column({ name: 'object_key', type: 'varchar', length: 500 })
  objectKey!: string;

  @Column({ name: 'mime_type', type: 'varchar', length: 120 })
  mimeType!: string;

  @Column({ name: 'byte_size', type: 'bigint' })
  byteSize!: string;
}

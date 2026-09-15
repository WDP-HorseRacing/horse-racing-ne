import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseRecordEntity } from '../../../common/database/base-record.entity';
import { UserEntity } from '../../users/entities/user.entity';

/**
 * RefreshTokenEntity: lưu refresh token cho người dùng để hỗ trợ xác thực dài hạn.
 * Dùng để quản lý thời hạn và trạng thái thu hồi token.
 */
@Entity({ name: 'refresh_tokens' })
@Index('refresh_tokens_token_hash_uq', ['tokenHash'], { unique: true })
export class RefreshTokenEntity extends BaseRecordEntity {
  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @ManyToOne(() => UserEntity, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: UserEntity;

  @Column({ name: 'token_hash', type: 'varchar', length: 255 })
  tokenHash!: string;

  // hết hạn
  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt!: Date;

  // bị thu hồi
  @Column({ name: 'revoked_at', type: 'timestamptz', nullable: true })
  revokedAt!: Date | null;
}

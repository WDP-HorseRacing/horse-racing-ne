import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { SoftDeletableRecordEntity } from '../../../common/database/base-record.entity';
import { ClubEntity } from './club.entity';
import { UserRole, UserStatus } from '../user.enums';

@Entity({ name: 'users' })
@Index('users_club_email_uq', ['clubId', 'email'], {
  unique: true,
  where: 'deleted_at IS NULL',
})
@Index('users_keycloak_id_uq', ['keycloakId'], {
  unique: true,
  where: 'deleted_at IS NULL',
})
export class UserEntity extends SoftDeletableRecordEntity {
  @Column({ name: 'club_id', type: 'uuid' })
  clubId!: string;

  @Column({ name: 'keycloak_id', type: 'uuid' })
  keycloakId!: string;

  @ManyToOne(() => ClubEntity, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'club_id' })
  club!: ClubEntity;

  @Column({ name: 'full_name', type: 'varchar', length: 160 })
  fullName!: string;

  @Column({ type: 'varchar', length: 254 })
  email!: string;

  // Khong dung: Keycloak giu mat khau. Cot nay se luon null.
  @Column({
    name: 'password_hash',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  passwordHash!: string | null;

  @Column({ type: 'varchar', length: 32 })
  role!: UserRole;

  @Column({ type: 'varchar', length: 32, default: UserStatus.ACTIVE })
  status!: UserStatus;
}

import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { SoftDeletableRecordEntity } from '../../../common/database/base-record.entity';
import { ClubEntity } from './club.entity';
import { UserRole, UserStatus } from '../user.enums';

@Entity({ name: 'users' })
@Index('users_club_email_uq', ['clubId', 'email'], {
  unique: true,
  where: 'deleted_at IS NULL',
})
// Postgres coi moi NULL la khac nhau, nen index tren KHONG chan duoc mot email
// dang ky nhieu lan luc chua co CLB. Index thu hai lo phan do.
@Index('users_pending_email_uq', ['email'], {
  unique: true,
  where: 'club_id IS NULL AND deleted_at IS NULL',
})
@Index('users_keycloak_id_uq', ['keycloakId'], {
  unique: true,
  where: 'deleted_at IS NULL',
})
export class UserEntity extends SoftDeletableRecordEntity {
  /** NULL khi nguoi dung tu dang ky ma chua chon CLB. */
  @Column({ name: 'club_id', type: 'uuid', nullable: true })
  clubId!: string | null;

  @Column({ name: 'keycloak_id', type: 'uuid' })
  keycloakId!: string;

  @ManyToOne(() => ClubEntity, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'club_id' })
  club!: ClubEntity | null;

  @Column({ name: 'full_name', type: 'varchar', length: 160 })
  fullName!: string;

  @Column({ type: 'varchar', length: 254 })
  email!: string;

  @Column({
    name: 'password_hash',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  passwordHash!: string | null;

  /** NULL cho toi khi CLUB_MANAGER duyet va gan role. */
  @Column({ type: 'varchar', length: 32, nullable: true })
  role!: UserRole | null;

  // Mac dinh PENDING: quen set thi tai khoan bi chan, khong phai mo toang.
  @Column({ type: 'varchar', length: 32, default: UserStatus.PENDING })
  status!: UserStatus;
}

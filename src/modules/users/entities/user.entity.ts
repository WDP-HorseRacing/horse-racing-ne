import { Column, Entity, Index } from 'typeorm';
import { SoftDeletableRecordEntity } from '../../../common/database/base-record.entity';
import { UserRole, UserStatus } from '../user.enums';

@Entity({ name: 'users' })
@Index('users_email_uq', ['email'], {
  unique: true,
  where: 'deleted_at IS NULL',
})
@Index('users_keycloak_id_uq', ['keycloakId'], {
  unique: true,
  where: 'deleted_at IS NULL',
})
export class UserEntity extends SoftDeletableRecordEntity {
  @Column({ name: 'keycloak_id', type: 'uuid' })
  keycloakId!: string;

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

  @Column({ type: 'varchar', length: 32, nullable: true })
  role!: UserRole | null;

  @Column({ type: 'varchar', length: 32, default: UserStatus.INACTIVE })
  status!: UserStatus;
}

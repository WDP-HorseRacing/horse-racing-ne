import { Column, Entity, Index } from 'typeorm';
import { SoftDeletableRecordEntity } from '../../../common/database/base-record.entity';
import { ClubStatus } from '../constants/club-status.enum';

/**
 * ClubEntity: đại diện cho một câu lạc bộ / đơn vị vận hành.
 * Một club chứa nhiều user, horse, stall và các resource khác.
 * Dùng để phân tách dữ liệu theo club thay vì dùng chung toàn hệ thống.
 */
@Entity({ name: 'clubs' })
@Index('clubs_name_uq', ['name'], { unique: true, where: 'deleted_at IS NULL' })
export class ClubEntity extends SoftDeletableRecordEntity {
  @Column({ type: 'varchar', length: 160 })
  name!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({ type: 'varchar', length: 160, nullable: true })
  email!: string | null;

  @Column({ type: 'varchar', length: 40, nullable: true })
  phone!: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  address!: string | null;

  @Column({ name: 'logo_url', type: 'varchar', length: 500, nullable: true })
  logoUrl!: string | null;

  @Column({
    type: 'varchar',
    length: 32,
    default: ClubStatus.ACTIVE,
    enum: ClubStatus,
  })
  status!: ClubStatus;
}

import { Column, Entity, Index } from 'typeorm';
import { SoftDeletableRecordEntity } from '../../../common/database/base-record.entity';

@Entity({ name: 'clubs' })
@Index('clubs_name_uq', ['name'], { unique: true, where: 'deleted_at IS NULL' })
export class ClubEntity extends SoftDeletableRecordEntity {
  @Column({ type: 'varchar', length: 160 })
  name!: string;

  @Column({ type: 'varchar', length: 32, default: 'ACTIVE' })
  status!: string;
}

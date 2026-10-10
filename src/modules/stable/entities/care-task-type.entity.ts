import { Column, Entity, Index } from 'typeorm';
import { MutableRecordEntity } from '../../../common/database/base-record.entity';

/**
 * Loại việc chăm sóc hằng ngày (cho ăn, vệ sinh chuồng...), danh mục do Club Manager quản lý
 */
@Entity({ name: 'care_task_types' })
@Index('care_task_types_name_uq', ['name'], { unique: true })
export class CareTaskTypeEntity extends MutableRecordEntity {
  @Column({ type: 'varchar', length: 80 })
  name!: string;

  @Column({ name: 'applies_to_all', type: 'boolean' })
  appliesToAll!: boolean;

  @Column({ type: 'boolean', default: true })
  active!: boolean;
}

import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
} from 'typeorm';
import { MutableRecordEntity } from '../../../common/database/base-record.entity';
import { HorseEntity } from '../../horses/entities/horse.entity';
import { UserEntity } from '../../users/entities/user.entity';
import { FeedingPlanStatus } from '../constants/feeding-plan-status.enum';
import { FeedingPlanItemEntity } from './feeding-plan-item.entity';

/**
 * Khẩu phần ăn của một con ngựa; mỗi lần đổi là một bản mới, bản cũ giữ làm lịch sử
 */
@Entity({ name: 'feeding_plans' })
@Index('feeding_plans_horse_created_idx', ['horseId', 'createdAt'])
@Index('feeding_plans_horse_active_uq', ['horseId'], {
  unique: true,
  where: `status = 'ACTIVE'`,
})
export class FeedingPlanEntity extends MutableRecordEntity {
  @Column({ name: 'horse_id', type: 'uuid' })
  horseId!: string;

  @ManyToOne(() => HorseEntity, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'horse_id' })
  horse!: HorseEntity;

  @Column({ type: 'varchar', length: 32, default: FeedingPlanStatus.DRAFT })
  status!: FeedingPlanStatus;

  @Column({ type: 'text', nullable: true })
  note!: string | null;

  @Column({ name: 'created_by', type: 'uuid' })
  createdBy!: string;

  @ManyToOne(() => UserEntity, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({
    name: 'created_by',
    foreignKeyConstraintName: 'feeding_plans_created_by_fk',
  })
  creator!: UserEntity;

  @Column({ name: 'approved_by', type: 'uuid', nullable: true })
  approvedBy!: string | null;

  @ManyToOne(() => UserEntity, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'approved_by' })
  approver!: UserEntity | null;

  @Column({ name: 'approved_at', type: 'timestamptz', nullable: true })
  approvedAt!: Date | null;

  @Column({ name: 'archived_at', type: 'timestamptz', nullable: true })
  archivedAt!: Date | null;

  @OneToMany(() => FeedingPlanItemEntity, (item) => item.plan)
  items!: FeedingPlanItemEntity[];
}

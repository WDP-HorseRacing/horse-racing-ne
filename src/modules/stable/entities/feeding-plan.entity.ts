import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { MutableRecordEntity } from '../../../common/database/base-record.entity';
import { HorseEntity } from '../../horses/entities/horse.entity';
import { UserEntity } from '../../users/entities/user.entity';
import { FeedingPlanStatus } from '../constants/feeding-plan-status.enum';

/**
 * FeedingPlanEntity: kế hoạch ăn uống cho ngựa theo một khoảng thời gian hiệu lực.
 * Dùng để lưu khẩu phần, người duyệt và trạng thái của các giai đoạn dinh dưỡng.
 */
@Entity({ name: 'feeding_plans' })
export class FeedingPlanEntity extends MutableRecordEntity {
  @Column({ name: 'horse_id', type: 'uuid' })
  horseId!: string;

  @ManyToOne(() => HorseEntity, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'horse_id' })
  horse!: HorseEntity;

  @Column({ name: 'approved_by', type: 'uuid', nullable: true })
  approvedBy!: string | null;

  @ManyToOne(() => UserEntity, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'approved_by' })
  approver!: UserEntity | null;

  @Column({ name: 'approved_at', type: 'timestamptz', nullable: true })
  approvedAt!: Date | null;

  @Column({
    type: 'varchar',
    length: 32,
    default: FeedingPlanStatus.DRAFT,
    enum: FeedingPlanStatus,
  })
  status!: FeedingPlanStatus;

  @Column({ name: 'effective_from', type: 'date' })
  effectiveFrom!: string;

  @Column({ name: 'effective_to', type: 'date', nullable: true })
  effectiveTo!: string | null;

  @Column({ type: 'jsonb' })
  ration!: Record<string, unknown>;
}

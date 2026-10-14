import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseRecordEntity } from '../../../common/database/base-record.entity';
import { UserEntity } from '../../users/entities/user.entity';

/**
 * Một mức phí nuôi ngựa theo ngày của CLB, áp dụng từ ngày hiệu lực tới trước mức kế tiếp
 */
@Entity({ name: 'daily_fees' })
@Index('daily_fees_effective_from_uq', ['effectiveFrom'], { unique: true })
@Check('daily_fees_daily_fee_nonnegative_ck', '"daily_fee" >= 0')
export class DailyFeeEntity extends BaseRecordEntity {
  @Column({ name: 'effective_from', type: 'date' })
  effectiveFrom!: string;

  @Column({ name: 'daily_fee', type: 'bigint' })
  dailyFee!: string;

  @Column({ name: 'created_by', type: 'uuid' })
  createdBy!: string;

  @ManyToOne(() => UserEntity, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({
    name: 'created_by',
    foreignKeyConstraintName: 'daily_fees_created_by_fk',
  })
  creator!: UserEntity;
}

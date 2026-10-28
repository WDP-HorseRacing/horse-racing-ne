import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { MutableRecordEntity } from '../../../common/database/base-record.entity';
import { HorseEntity } from '../../horses/entities/horse.entity';
import { UserEntity } from '../../users/entities/user.entity';

/**
 * Một khoản phụ phí chăm sóc riêng của một con ngựa: mô tả tự do, tính theo ngày trong một khoảng ngày; Head Trainer xác nhận đã áp dụng (applied_by, applied_at), chưa xác nhận thì cả hai null
 */
@Entity({ name: 'horse_surcharges' })
@Index('horse_surcharges_horse_idx', ['horseId', 'startDate'])
@Check('horse_surcharges_daily_amount_positive_ck', '"daily_amount" > 0')
@Check('horse_surcharges_dates_ck', '"end_date" >= "start_date"')
@Check(
  'horse_surcharges_applied_ck',
  '("applied_by" IS NULL) = ("applied_at" IS NULL)',
)
export class HorseSurchargeEntity extends MutableRecordEntity {
  @Column({ name: 'horse_id', type: 'uuid' })
  horseId!: string;

  @ManyToOne(() => HorseEntity, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({
    name: 'horse_id',
    foreignKeyConstraintName: 'horse_surcharges_horse_fk',
  })
  horse!: HorseEntity;

  @Column({ type: 'varchar', length: 500 })
  description!: string;

  @Column({ name: 'daily_amount', type: 'bigint' })
  dailyAmount!: string;

  @Column({ name: 'start_date', type: 'date' })
  startDate!: string;

  @Column({ name: 'end_date', type: 'date' })
  endDate!: string;

  @Column({ name: 'created_by', type: 'uuid' })
  createdBy!: string;

  @ManyToOne(() => UserEntity, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({
    name: 'created_by',
    foreignKeyConstraintName: 'horse_surcharges_created_by_fk',
  })
  creator!: UserEntity;

  @Column({ name: 'applied_by', type: 'uuid', nullable: true })
  appliedBy!: string | null;

  @ManyToOne(() => UserEntity, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({
    name: 'applied_by',
    foreignKeyConstraintName: 'horse_surcharges_applied_by_fk',
  })
  applier!: UserEntity | null;

  @Column({ name: 'applied_at', type: 'timestamptz', nullable: true })
  appliedAt!: Date | null;
}

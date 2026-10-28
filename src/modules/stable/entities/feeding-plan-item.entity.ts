import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseRecordEntity } from '../../../common/database/base-record.entity';
import { SupplyItemEntity } from '../../supplies/entities/supply-item.entity';
import { FeedingMeal } from '../constants/feeding-meal.enum';
import { FeedingPlanEntity } from './feeding-plan.entity';

/**
 * Một dòng khẩu phần: một món ở một bữa với lượng theo đơn vị của vật tư
 */
@Entity({ name: 'feeding_plan_items' })
@Index(
  'feeding_plan_items_plan_meal_item_uq',
  ['planId', 'meal', 'supplyItemId'],
  {
    unique: true,
  },
)
@Check('feeding_plan_items_quantity_positive_ck', '"quantity" > 0')
export class FeedingPlanItemEntity extends BaseRecordEntity {
  @Column({ name: 'plan_id', type: 'uuid' })
  planId!: string;

  @ManyToOne(() => FeedingPlanEntity, (plan) => plan.items, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({
    name: 'plan_id',
    foreignKeyConstraintName: 'feeding_plan_items_plan_fk',
  })
  plan!: FeedingPlanEntity;

  @Column({ type: 'varchar', length: 32 })
  meal!: FeedingMeal;

  @Column({ name: 'supply_item_id', type: 'uuid' })
  supplyItemId!: string;

  @ManyToOne(() => SupplyItemEntity, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({
    name: 'supply_item_id',
    foreignKeyConstraintName: 'feeding_plan_items_supply_item_fk',
  })
  supplyItem!: SupplyItemEntity;

  @Column({ type: 'numeric', precision: 12, scale: 2 })
  quantity!: string;

  @Column({ type: 'varchar', length: 200, nullable: true })
  note!: string | null;

  @Column({ type: 'smallint' })
  position!: number;
}

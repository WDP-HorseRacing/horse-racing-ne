import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FeedingPlanItemEntity } from '../entities/feeding-plan-item.entity';
import { FeedingPlanEntity } from '../entities/feeding-plan.entity';
import { StableSharedModule } from '../shared/stable-shared.module';
import { FeedingPlansController } from './feeding-plans.controller';
import { FeedingPlansService } from './feeding-plans.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([FeedingPlanEntity, FeedingPlanItemEntity]),
    StableSharedModule,
  ],
  controllers: [FeedingPlansController],
  providers: [FeedingPlansService],
})
export class FeedingPlansModule {}

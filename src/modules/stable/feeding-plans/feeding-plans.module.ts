import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FeedingPlanEntity } from '../entities/feeding-plan.entity';
import { FeedingPlansController } from './feeding-plans.controller';

@Module({
  imports: [TypeOrmModule.forFeature([FeedingPlanEntity])],
  controllers: [FeedingPlansController],
})
export class FeedingPlansModule {}

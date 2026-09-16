import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TrainingPlanEntity } from '../entities/training-plan.entity';
import { TrainingSharedModule } from '../shared/training-shared.module';
import { TrainingPlansController } from './training-plans.controller';
import { TrainingPlansRepository } from './training-plans.repository';
import { TrainingPlansService } from './training-plans.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([TrainingPlanEntity]),
    TrainingSharedModule,
  ],
  controllers: [TrainingPlansController],
  providers: [TrainingPlansRepository, TrainingPlansService],
  exports: [TrainingPlansService],
})
export class TrainingPlansModule {}

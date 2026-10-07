import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TrainingPlanSubjectEntity } from '../entities/training-plan-subject.entity';
import { TrainingPlanEntity } from '../entities/training-plan.entity';
import { TrainingSharedModule } from '../shared/training-shared.module';
import { TrainingPlansController } from './training-plans.controller';
import { TrainingPlansService } from './training-plans.service';

/**
 * Lắp ráp use case giáo án của Head Trainer
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([TrainingPlanEntity, TrainingPlanSubjectEntity]),
    TrainingSharedModule,
  ],
  controllers: [TrainingPlansController],
  providers: [TrainingPlansService],
})
export class TrainingPlansModule {}

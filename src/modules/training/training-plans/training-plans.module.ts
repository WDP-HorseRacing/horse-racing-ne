import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TrainingPlanPhaseEntity } from '../entities/training-plan-phase.entity';
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
    TypeOrmModule.forFeature([
      TrainingPlanEntity,
      TrainingPlanPhaseEntity,
      TrainingPlanSubjectEntity,
    ]),
    TrainingSharedModule,
  ],
  controllers: [TrainingPlansController],
  providers: [TrainingPlansService],
})
export class TrainingPlansModule {}

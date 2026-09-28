import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TrainingSharedModule } from '../../training/shared/training-shared.module';
import { PerformanceEvaluationEntity } from '../entities/performance-evaluation.entity';
import { PerformanceEvaluationsController } from './performance-evaluations.controller';
import { PerformanceEvaluationsService } from './performance-evaluations.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([PerformanceEvaluationEntity]),
    TrainingSharedModule,
  ],
  controllers: [PerformanceEvaluationsController],
  providers: [PerformanceEvaluationsService],
})
export class EvaluationsModule {}

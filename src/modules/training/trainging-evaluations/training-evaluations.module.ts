import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PerformanceEvaluationEntity } from '../entities/performance-evaluation.entity';
import { TrainingSharedModule } from '../shared/training-shared.module';
import { EvaluationsController } from './training-evaluations.controller';
import { EvaluationsService } from './training-evaluations.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([PerformanceEvaluationEntity]),
    TrainingSharedModule,
  ],
  controllers: [EvaluationsController],
  providers: [EvaluationsService],
  exports: [EvaluationsService],
})
export class EvaluationsModule {}

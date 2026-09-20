import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PerformanceEvaluationEntity } from '../../performance/entities/performance-evaluation.entity';
import { TrainingSharedModule } from '../shared/training-shared.module';
import { EvaluationsController } from './evaluations.controller';
import { EvaluationsService } from './evaluations.service';

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

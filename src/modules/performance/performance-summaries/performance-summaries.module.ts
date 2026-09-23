import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PerformanceEvaluationEntity } from '../entities/performance-evaluation.entity';
import { PerformanceMetricEntity } from '../entities/performance-metric.entity';
import { PerformanceSummariesController } from './performance-summaries.controller';
import { PerformanceSummariesRepository } from './performance-summaries.repository';
import { PerformanceSummariesService } from './performance-summaries.service';

/**
 * Owns the implemented horse and session performance summary workflows.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      PerformanceMetricEntity,
      PerformanceEvaluationEntity,
    ]),
  ],
  controllers: [PerformanceSummariesController],
  providers: [PerformanceSummariesRepository, PerformanceSummariesService],
})
export class PerformanceSummariesModule {}

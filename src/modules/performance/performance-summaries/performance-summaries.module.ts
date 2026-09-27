import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HorsesSharedModule } from '../../horses/shared/horses-shared.module';
import { EvaluationsModule } from '../../training/trainging-evaluations/training-evaluations.module';
import { PerformanceMetricEntity } from '../entities/performance-metric.entity';
import { PerformanceSummariesController } from './performance-summaries.controller';
import { PerformanceSummariesRepository } from './performance-summaries.repository';
import { PerformanceSummariesService } from './performance-summaries.service';

/**
 * Owns the implemented horse and session performance summary workflows.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([PerformanceMetricEntity]),
    HorsesSharedModule,
    EvaluationsModule,
  ],
  controllers: [PerformanceSummariesController],
  providers: [PerformanceSummariesRepository, PerformanceSummariesService],
})
export class PerformanceSummariesModule {}

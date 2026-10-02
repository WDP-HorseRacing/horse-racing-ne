import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HorsesSharedModule } from '../../horses/shared/horses-shared.module';
import { PerformanceEvaluationEntity } from '../entities/performance-evaluation.entity';
import { PerformanceMetricEntity } from '../entities/performance-metric.entity';
import { PerformanceSummariesController } from './performance-summaries.controller';
import { PerformanceSummariesRepository } from './performance-summaries.repository';
import { PerformanceSummariesService } from './performance-summaries.service';

/**
 * Lắp ráp các use case tổng hợp hiệu suất của ngựa và theo từng buổi tập.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      PerformanceMetricEntity,
      PerformanceEvaluationEntity,
    ]),
    HorsesSharedModule,
  ],
  controllers: [PerformanceSummariesController],
  providers: [PerformanceSummariesRepository, PerformanceSummariesService],
})
export class PerformanceSummariesModule {}

import { Module } from '@nestjs/common';
import { PerformanceDetailsModule } from './performance-details/performance-details.module';
import { EvaluationsModule } from './evaluations/evaluations.module';
import { PerformanceMetricsModule } from './performance-metrics/performance-metrics.module';
import { PerformanceThresholdsModule } from './performance-thresholds/performance-thresholds.module';
import { PerformanceSummariesModule } from './performance-summaries/performance-summaries.module';

@Module({
  imports: [
    PerformanceSummariesModule,
    EvaluationsModule,
    PerformanceMetricsModule,
    PerformanceDetailsModule,
    PerformanceThresholdsModule,
  ],
})
export class PerformanceModule {}

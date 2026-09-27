import { Module } from '@nestjs/common';
import { PerformanceDetailsModule } from './performance-details/performance-details.module';
import { PerformanceMetricsModule } from './performance-metrics/performance-metrics.module';
import { PerformanceSummariesModule } from './performance-summaries/performance-summaries.module';

@Module({
  imports: [
    PerformanceSummariesModule,
    PerformanceMetricsModule,
    PerformanceDetailsModule,
  ],
})
export class PerformanceModule {}

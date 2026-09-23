import { Module } from '@nestjs/common';
import { PerformanceMetricsController } from './performance-metrics.controller';

/**
 * Owns metric ingestion and raw metric routes. The service is contract-only
 * until metric write/read workflows are implemented.
 */
@Module({
  controllers: [PerformanceMetricsController],
})
export class PerformanceMetricsModule {}

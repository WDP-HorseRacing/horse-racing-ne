import { Module } from '@nestjs/common';
import { PerformanceDetailsController } from './performance-details.controller';

/**
 * Owns the performance detail routes that are currently contract-only.
 */
@Module({
  controllers: [PerformanceDetailsController],
})
export class PerformanceDetailsModule {}

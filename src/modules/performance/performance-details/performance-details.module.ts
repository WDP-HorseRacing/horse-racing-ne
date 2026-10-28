import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { HorsesSharedModule } from '../../horses/shared/horses-shared.module';
import {
  PerformanceMetric,
  PerformanceMetricSchema,
} from '../schemas/performance-metric.schema';
import { PerformanceDetailsController } from './performance-details.controller';
import { PerformanceDetailsRepository } from './performance-details.repository';
import { PerformanceDetailsService } from './performance-details.service';

/**
 * Lắp ráp chi tiết hiệu suất của ngựa: khối lượng tập và cảnh báo
 */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: PerformanceMetric.name, schema: PerformanceMetricSchema },
    ]),
    HorsesSharedModule,
  ],
  controllers: [PerformanceDetailsController],
  providers: [PerformanceDetailsRepository, PerformanceDetailsService],
})
export class PerformanceDetailsModule {}

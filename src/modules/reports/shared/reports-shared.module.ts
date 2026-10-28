import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  PerformanceMetric,
  PerformanceMetricSchema,
} from '../../performance/schemas/performance-metric.schema';
import { ReportsAccessService } from './reports-access.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: PerformanceMetric.name, schema: PerformanceMetricSchema },
    ]),
  ],
  providers: [ReportsAccessService],
  exports: [ReportsAccessService],
})
export class ReportsSharedModule {}

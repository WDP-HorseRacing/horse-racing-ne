import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { RealtimeModule } from '../../realtime/realtime.module';
import { TrainingSharedModule } from '../../training/shared/training-shared.module';
import {
  PerformanceMetric,
  PerformanceMetricSchema,
} from '../schemas/performance-metric.schema';
import { PerformanceMetricsController } from './performance-metrics.controller';
import { PerformanceMetricsService } from './performance-metrics.service';

/**
 * Lắp ráp use case nhận điểm đo nhịp tim/tốc độ của lượt tập
 */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: PerformanceMetric.name, schema: PerformanceMetricSchema },
    ]),
    TrainingSharedModule,
    RealtimeModule,
  ],
  controllers: [PerformanceMetricsController],
  providers: [PerformanceMetricsService],
})
export class PerformanceMetricsModule {}

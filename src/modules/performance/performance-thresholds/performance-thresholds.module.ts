import { Module } from '@nestjs/common';
import { HorsesSharedModule } from '../../horses/shared/horses-shared.module';
import { PerformanceThresholdsController } from './performance-thresholds.controller';
import { PerformanceThresholdsService } from './performance-thresholds.service';

/**
 * Lắp ráp use case xem ngưỡng nhịp tim/tốc độ của ngựa
 */
@Module({
  imports: [HorsesSharedModule],
  controllers: [PerformanceThresholdsController],
  providers: [PerformanceThresholdsService],
})
export class PerformanceThresholdsModule {}

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HorsesSharedModule } from '../../horses/shared/horses-shared.module';
import { PerformanceThresholdEntity } from '../entities/performance-threshold.entity';
import { PerformanceSharedModule } from '../shared/performance-shared.module';
import { PerformanceThresholdsController } from './performance-thresholds.controller';
import { PerformanceThresholdsService } from './performance-thresholds.service';

/**
 * Lắp ráp use case xem và đặt ngưỡng nhịp tim/tốc độ của ngựa
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([PerformanceThresholdEntity]),
    HorsesSharedModule,
    PerformanceSharedModule,
  ],
  controllers: [PerformanceThresholdsController],
  providers: [PerformanceThresholdsService],
})
export class PerformanceThresholdsModule {}

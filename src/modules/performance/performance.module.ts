import { Module } from '@nestjs/common';
import { PerformanceController } from './controllers/performance.controller';
import { PerformanceDetailsController } from './controllers/performance-details.controller';

@Module({ controllers: [PerformanceController, PerformanceDetailsController] })
export class PerformanceModule {}

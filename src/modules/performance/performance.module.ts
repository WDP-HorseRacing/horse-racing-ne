import { Module } from '@nestjs/common';
import { PerformanceController } from './controllers/performance.controller';

@Module({ controllers: [PerformanceController] })
export class PerformanceModule {}

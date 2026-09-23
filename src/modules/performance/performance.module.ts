import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HorsesSharedModule } from '../horses/shared/horses-shared.module';
import { EvaluationsModule } from '../training/trainging-evaluations/training-evaluations.module';
import { PerformanceDetailsController } from './controllers/performance-details.controller';
import { PerformanceController } from './controllers/performance.controller';
import { PerformanceMetricEntity } from './entities/performance-metric.entity';
import { PerformanceRepository } from './repositories/performance.repository';
import { PerformanceService } from './services/performance.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([PerformanceMetricEntity]),
    HorsesSharedModule,
    EvaluationsModule,
  ],
  providers: [PerformanceRepository, PerformanceService],
  controllers: [PerformanceController, PerformanceDetailsController],
})
export class PerformanceModule {}

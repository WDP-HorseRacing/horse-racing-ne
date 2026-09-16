import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PerformanceDetailsController } from './controllers/performance-details.controller';
import { PerformanceController } from './controllers/performance.controller';
import { PerformanceEvaluationEntity } from './entities/performance-evaluation.entity';
import { PerformanceMetricEntity } from './entities/performance-metric.entity';
import { PerformanceRepository } from './repositories/performance.repository';
import { PerformanceService } from './services/performance.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      PerformanceMetricEntity,
      PerformanceEvaluationEntity,
    ]),
  ],
  providers: [PerformanceRepository, PerformanceService],
  controllers: [PerformanceController, PerformanceDetailsController],
})
export class PerformanceModule {}

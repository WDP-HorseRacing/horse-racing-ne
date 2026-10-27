import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HorsesSharedModule } from '../../horses/shared/horses-shared.module';
import { PerformanceEvaluationEntity } from '../entities/performance-evaluation.entity';
import {
  PerformanceMetric,
  PerformanceMetricSchema,
} from '../schemas/performance-metric.schema';
import { PerformanceSummariesController } from './performance-summaries.controller';
import { PerformanceSummariesRepository } from './performance-summaries.repository';
import { PerformanceSummariesService } from './performance-summaries.service';

/**
 * Lắp ráp các use case tổng hợp hiệu suất của ngựa và theo từng buổi tập.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([PerformanceEvaluationEntity]),
    MongooseModule.forFeature([
      { name: PerformanceMetric.name, schema: PerformanceMetricSchema },
    ]),
    HorsesSharedModule,
  ],
  controllers: [PerformanceSummariesController],
  providers: [PerformanceSummariesRepository, PerformanceSummariesService],
})
export class PerformanceSummariesModule {}

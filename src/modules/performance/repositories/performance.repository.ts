import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PerformanceEvaluationEntity } from '../entities/performance-evaluation.entity';
import { PerformanceMetricEntity } from '../entities/performance-metric.entity';

@Injectable()
export class PerformanceRepository {
  constructor(
    @InjectRepository(PerformanceMetricEntity)
    private readonly metrics: Repository<PerformanceMetricEntity>,
    @InjectRepository(PerformanceEvaluationEntity)
    private readonly evaluations: Repository<PerformanceEvaluationEntity>,
  ) {}

  listMetrics(horseId: string): Promise<PerformanceMetricEntity[]> {
    return this.metrics.find({
      where: { session: { plan: { horseId } } },
      relations: { session: { plan: true } },
      order: { recordedAt: 'DESC' },
      take: 100,
    });
  }

  listEvaluations(horseId: string): Promise<PerformanceEvaluationEntity[]> {
    return this.evaluations.find({
      where: { session: { plan: { horseId } } },
      relations: { session: { plan: true } },
      order: { createdAt: 'DESC' },
      take: 1,
    });
  }
}

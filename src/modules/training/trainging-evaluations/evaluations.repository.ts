import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PerformanceEvaluationEntity } from '../../performance/entities/performance-evaluation.entity';

@Injectable()
export class EvaluationsRepository {
  constructor(
    @InjectRepository(PerformanceEvaluationEntity)
    private readonly evaluations: Repository<PerformanceEvaluationEntity>,
  ) {}

  findBySession(
    sessionId: string,
  ): Promise<PerformanceEvaluationEntity | null> {
    return this.evaluations.findOneBy({ sessionId });
  }
}

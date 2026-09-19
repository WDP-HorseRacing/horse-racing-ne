import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TrainingSessionEntity } from '../entities/training-session.entity';

@Injectable()
export class TrainingSessionsRepository {
  constructor(
    @InjectRepository(TrainingSessionEntity)
    private readonly sessions: Repository<TrainingSessionEntity>,
  ) {}

  listByPlan(planId: string): Promise<TrainingSessionEntity[]> {
    return this.sessions.find({
      where: { planId },
      order: { scheduledAt: 'ASC' },
    });
  }
}

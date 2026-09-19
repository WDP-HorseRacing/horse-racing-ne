import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TrainingPlanEntity } from '../entities/training-plan.entity';

@Injectable()
export class TrainingPlansRepository {
  constructor(
    @InjectRepository(TrainingPlanEntity)
    private readonly plans: Repository<TrainingPlanEntity>,
  ) {}

  listByHorse(horseId: string): Promise<TrainingPlanEntity[]> {
    return this.plans.find({
      where: { horseId },
      order: { startDate: 'DESC' },
    });
  }

  save(plan: Partial<TrainingPlanEntity>): Promise<TrainingPlanEntity> {
    return this.plans.save(this.plans.create(plan));
  }
}

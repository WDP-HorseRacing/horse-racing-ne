import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TimeTrialEntity } from '../entities/time-trial.entity';

@Injectable()
export class TimeTrialsRepository {
  constructor(
    @InjectRepository(TimeTrialEntity)
    private readonly timeTrials: Repository<TimeTrialEntity>,
  ) {}

  listBySession(sessionId: string): Promise<TimeTrialEntity[]> {
    return this.timeTrials.find({
      where: { sessionId },
      order: { createdAt: 'ASC' },
    });
  }

  findById(id: string): Promise<TimeTrialEntity | null> {
    return this.timeTrials.findOne({
      where: { id },
      relations: { session: { plan: { horse: true } } },
    });
  }
}

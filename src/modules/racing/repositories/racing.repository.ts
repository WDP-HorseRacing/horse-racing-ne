import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RaceRegistrationEntity } from '../entities/race-registration.entity';

@Injectable()
export class RacingRepository {
  constructor(
    @InjectRepository(RaceRegistrationEntity)
    private readonly registrations: Repository<RaceRegistrationEntity>,
  ) {}

  listResultsByHorse(horseId: string): Promise<RaceRegistrationEntity[]> {
    return this.registrations.find({
      select: {
        id: true,
        status: true,
        placing: true,
        timeSeconds: true,
        race: { id: true, name: true, scheduledAt: true, status: true },
      },
      where: { horseId },
      relations: { race: true },
      order: { race: { scheduledAt: 'DESC' } },
    });
  }
}

import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { Actor } from '../../../common/types/actor';
import { HorseAccessService } from '../../horses/shared/horse-access.service';
import { HorseRaceResultResponseDto } from '../dto/horse-race-result.response.dto';
import { RaceRegistrationEntity } from '../entities/race-registration.entity';
import { toHorseRaceResultResponse } from '../mappers/racing.mapper';

@Injectable()
export class RaceResultsService {
  constructor(
    @InjectRepository(RaceRegistrationEntity)
    private readonly registrationsRepo: Repository<RaceRegistrationEntity>,
    private readonly horseAccess: HorseAccessService,
  ) {}

  async listHorseResults(
    actor: Actor,
    horseId: string,
  ): Promise<HorseRaceResultResponseDto[]> {
    await this.horseAccess.findVisible(actor, horseId);
    const registrations = await this.registrationsRepo.find({
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
    return registrations.map(toHorseRaceResultResponse);
  }
}

import { Injectable } from '@nestjs/common';
import type { Actor } from '../../../common/types/actor';
import { HorsesService } from '../../horses/services/horses.service';
import { HorseRaceResultResponseDto } from '../dto/horse-race-result.response.dto';
import { RacingRepository } from '../repositories/racing.repository';

@Injectable()
export class RacingService {
  constructor(
    private readonly racingRepository: RacingRepository,
    private readonly horsesService: HorsesService,
  ) {}

  async listHorseResults(
    actor: Actor,
    horseId: string,
  ): Promise<HorseRaceResultResponseDto[]> {
    await this.horsesService.findVisible(actor, horseId);
    const registrations =
      await this.racingRepository.listResultsByHorse(horseId);
    return registrations.map((registration) => ({
      registrationId: registration.id,
      raceId: registration.race.id,
      raceName: registration.race.name,
      scheduledAt: registration.race.scheduledAt,
      raceStatus: registration.race.status,
      registrationStatus: registration.status,
      placing: registration.placing,
      timeSeconds: registration.timeSeconds,
    }));
  }
}

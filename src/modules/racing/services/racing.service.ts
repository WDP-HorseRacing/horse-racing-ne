import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { Actor } from '../../../common/types/actor';
import { HorsesService } from '../../horses/services/horses.service';
import { currentUserForActor } from '../../users/utils/current-user';
import { HorseRaceResultResponseDto } from '../dto/horse-race-result.response.dto';
import { RacingRepository } from '../repositories/racing.repository';

@Injectable()
export class RacingService {
  constructor(
    private readonly racingRepository: RacingRepository,
    private readonly horsesService: HorsesService,
    private readonly dataSource: DataSource,
  ) {}

  async listHorseResults(
    actor: Actor,
    horseId: string,
  ): Promise<HorseRaceResultResponseDto[]> {
    const caller = await currentUserForActor(this.dataSource.manager, actor);
    await this.horsesService.findVisible(actor, horseId);
    const registrations = await this.racingRepository.listResultsByHorse(
      horseId,
      caller.clubId,
    );
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

import { Module } from '@nestjs/common';
import { RaceRegistrationsModule } from './race-registrations/race-registrations.module';
import { RaceResultsModule } from './race-results/race-results.module';
import { RacesModule } from './races/races.module';

@Module({
  imports: [RacesModule, RaceRegistrationsModule, RaceResultsModule],
})
export class RacingModule {}

import { Module } from '@nestjs/common';
import { HorseDeletionsModule } from './horse-deletions/horse-deletions.module';
import { HorseMeasurementsModule } from './horse-measurements/horse-measurements.module';
import { HorsePlacementsModule } from './horse-placements/horse-placements.module';
import { HorseProfilesModule } from './horse-profiles/horse-profiles.module';
import { HorseStatusesModule } from './horse-statuses/horse-statuses.module';

@Module({
  imports: [
    HorseProfilesModule,
    HorseDeletionsModule,
    HorseStatusesModule,
    HorseMeasurementsModule,
    HorsePlacementsModule,
  ],
})
export class HorsesModule {}

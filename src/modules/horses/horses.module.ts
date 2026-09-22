import { Module } from '@nestjs/common';
import { HorseMeasurementsModule } from './horse-measurements/horse-measurements.module';
import { HorseOwnershipsModule } from './horse-ownerships/horse-ownerships.module';
import { HorseProfilesModule } from './horse-profiles/horse-profiles.module';
import { HorseStatusesModule } from './horse-statuses/horse-statuses.module';
import { HorsesSharedModule } from './shared/horses-shared.module';

@Module({
  imports: [
    HorsesSharedModule,
    HorseProfilesModule,
    HorseStatusesModule,
    HorseOwnershipsModule,
    HorseMeasurementsModule,
  ],
  exports: [HorsesSharedModule],
})
export class HorsesModule {}

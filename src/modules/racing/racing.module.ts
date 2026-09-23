import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HorsesSharedModule } from '../horses/shared/horses-shared.module';
import { RacingDetailsController } from './controllers/racing-details.controller';
import { RacingController } from './controllers/racing.controller';
import { RaceRegistrationEntity } from './entities/race-registration.entity';
import { RacingRepository } from './repositories/racing.repository';
import { RacingService } from './services/racing.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([RaceRegistrationEntity]),
    HorsesSharedModule,
  ],
  providers: [RacingRepository, RacingService],
  controllers: [RacingController, RacingDetailsController],
  exports: [RacingRepository],
})
export class RacingModule {}

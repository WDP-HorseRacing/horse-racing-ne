import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HorsesSharedModule } from '../../horses/shared/horses-shared.module';
import { RaceRegistrationEntity } from '../entities/race-registration.entity';
import { RaceResultsController } from './race-results.controller';
import { RaceResultsService } from './race-results.service';

/**
 * Owns registration/result reads, including the implemented horse race history
 * use case.
 */
@Module({
  imports: [TypeOrmModule.forFeature([RaceRegistrationEntity]), HorsesSharedModule],
  controllers: [RaceResultsController],
  providers: [RaceResultsService],
})
export class RaceResultsModule {}

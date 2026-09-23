import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HorsesModule } from '../../horses/horses.module';
import { RaceRegistrationEntity } from '../entities/race-registration.entity';
import { RaceResultsController } from './race-results.controller';
import { RaceResultsService } from './race-results.service';

/**
 * Owns registration/result reads, including the implemented horse race history
 * use case.
 */
@Module({
  imports: [TypeOrmModule.forFeature([RaceRegistrationEntity]), HorsesModule],
  controllers: [RaceResultsController],
  providers: [RaceResultsService],
})
export class RaceResultsModule {}

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RaceEntity } from '../entities/race.entity';
import { RacesController } from './races.controller';

/**
 * Owns race lifecycle routes and the race aggregate persistence model.
 * The endpoints are contract-only until the race workflow service is added.
 */
@Module({
  imports: [TypeOrmModule.forFeature([RaceEntity])],
  controllers: [RacesController],
})
export class RacesModule {}

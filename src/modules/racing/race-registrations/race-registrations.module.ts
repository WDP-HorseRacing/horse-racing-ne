import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RaceRegistrationEntity } from '../entities/race-registration.entity';
import { RaceRegistrationsController } from './race-registrations.controller';

/**
 * Owns registration proposal, approval and detail routes.
 * The registration workflow service is still contract-only.
 */
@Module({
  imports: [TypeOrmModule.forFeature([RaceRegistrationEntity])],
  controllers: [RaceRegistrationsController],
})
export class RaceRegistrationsModule {}
